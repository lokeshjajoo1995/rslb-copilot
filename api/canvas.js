import crypto from "node:crypto";

/**
 * Salesforce Canvas endpoint.
 *
 * Salesforce POSTs a `signed_request` (application/x-www-form-urlencoded) when
 * it renders this app in an iframe. The signed request is:
 *
 *     <base64url HMAC-SHA256 signature> . <base64 JSON payload>
 *
 * This handler decodes the payload, (optionally) verifies the signature using
 * the Connected App's Consumer Secret (set CANVAS_CONSUMER_SECRET in Vercel),
 * and renders the context + any custom parameters so you can SEE what Canvas
 * passes in.
 */
export default async function handler(req, res) {
	if (req.method !== "POST") {
		// Canvas always POSTs. A GET here just means someone opened the URL directly.
		res.setHeader("Content-Type", "text/html; charset=utf-8");
		res.status(200).send(
			page(
				"Canvas endpoint ready",
				`<p>This endpoint expects a <strong>POST</strong> with a <code>signed_request</code>
				 from Salesforce Canvas. Open it as a Canvas app inside Salesforce to see the payload.</p>`,
			),
		);
		return;
	}

	// Vercel may or may not pre-parse the urlencoded body — handle both.
	let signedRequest = req.body?.signed_request;
	if (!signedRequest) {
		const raw = await readRawBody(req);
		signedRequest = new URLSearchParams(raw).get("signed_request");
	}

	if (!signedRequest || !signedRequest.includes(".")) {
		res.setHeader("Content-Type", "text/html; charset=utf-8");
		res
			.status(400)
			.send(page("No signed_request", `<p>No <code>signed_request</code> found in the POST body.</p>`));
		return;
	}

	const [signature, payload] = signedRequest.split(".");
	const decoded = JSON.parse(Buffer.from(payload, "base64").toString("utf-8"));

	// Optional signature verification (recommended for production).
	let signatureStatus = "not verified (CANVAS_CONSUMER_SECRET not set)";
	const secret = process.env.CANVAS_CONSUMER_SECRET;
	if (secret) {
		const expected = crypto
			.createHmac("sha256", secret)
			.update(payload)
			.digest("base64");
		signatureStatus = expected === signature ? "✅ VALID" : "❌ INVALID";
	}

	const ctx = decoded.context ?? {};
	const user = ctx.user ?? {};
	const org = ctx.organization ?? {};
	const params = ctx.environment?.parameters ?? {};

	// --- OAuth round-trip: use the token from the signed request to call back
	// into Salesforce as the current user and fetch real data. ---
	const client = decoded.client ?? {};
	const oauthToken = client.oauthToken;
	const instanceUrl = client.instanceUrl ?? ctx.links?.instanceUrl;

	// --- Chat view: when placed with view=chat, render the actual CoPilot chat
	// experience (seeded with the signed-request identity) instead of the
	// diagnostic payload dump. This is what "exposes the chatbot" via Canvas. ---
	if (params.view === "chat") {
		res.setHeader("Content-Type", "text/html; charset=utf-8");
		res.status(200).send(chatPage({ user, params, oauthToken, instanceUrl }));
		return;
	}

	const calloutHtml = await fetchSalesforceData(oauthToken, instanceUrl);

	const body = `
		<div class="grid">
			<section>
				<h2>👤 User (from signed request)</h2>
				<table>
					${row("userId", user.userId)}
					${row("userName", user.userName)}
					${row("fullName", user.fullName)}
					${row("email", user.email)}
					${row("locale", user.locale)}
				</table>
			</section>
			<section>
				<h2>🏢 Organization</h2>
				<table>
					${row("organizationId", org.organizationId)}
					${row("name", org.name)}
					${row("instanceUrl", ctx.links?.instanceUrl ?? decoded.client?.instanceUrl)}
				</table>
			</section>
		</div>

		<section>
			<h2>🎛️ Custom parameters <span class="muted">(context.environment.parameters)</span></h2>
			${
				Object.keys(params).length
					? `<table>${Object.entries(params)
							.map(([k, v]) => row(k, typeof v === "object" ? JSON.stringify(v) : v))
							.join("")}</table>`
					: `<p class="muted">None passed. Add them in the Visualforce/Lightning placement (see docs) to see them here.</p>`
			}
		</section>

		<section>
			<h2>🔗 Live Salesforce callback <span class="muted">(using client.oauthToken)</span></h2>
			${calloutHtml}
		</section>

		<section>
			<h2>🔐 Signature</h2>
			<p>Status: <strong>${signatureStatus}</strong></p>
		</section>

		<details>
			<summary>Full decoded signed request (JSON)</summary>
			<pre>${escapeHtml(JSON.stringify(decoded, null, 2))}</pre>
		</details>
	`;

	res.setHeader("Content-Type", "text/html; charset=utf-8");
	res.status(200).send(page("RS Living Benefits CoPilot — Canvas", body));
}

/**
 * Uses the OAuth token from the signed request to call the Salesforce REST API
 * as the current user, proving the full Canvas auth round-trip. Queries a few
 * recent Leads and returns an HTML fragment (table or error message).
 */
async function fetchSalesforceData(oauthToken, instanceUrl) {
	if (!oauthToken || !instanceUrl) {
		return `<p class="muted">No <code>oauthToken</code> / <code>instanceUrl</code> in the signed request — cannot call back.</p>`;
	}
	const apiVersion = "62.0";
	const soql = "SELECT Id, Name, Company, Status FROM Lead ORDER BY CreatedDate DESC LIMIT 5";
	const url = `${instanceUrl}/services/data/v${apiVersion}/query?q=${encodeURIComponent(soql)}`;
	try {
		const resp = await fetch(url, {
			headers: {
				Authorization: `Bearer ${oauthToken}`,
				Accept: "application/json",
			},
		});
		const rawText = await resp.text();
		if (!resp.ok) {
			return `<p class="err">Callback failed — HTTP ${resp.status}</p><pre>${escapeHtml(rawText.slice(0, 500))}</pre>`;
		}
		const data = JSON.parse(rawText);
		const records = data.records ?? [];
		if (records.length === 0) {
			return `<p class="muted">Token worked ✅ — query returned 0 Leads.</p>`;
		}
		const rows = records
			.map(
				(r) =>
					`<tr><td>${escapeHtml(r.Name ?? "")}</td><td>${escapeHtml(r.Company ?? "")}</td><td>${escapeHtml(r.Status ?? "")}</td></tr>`,
			)
			.join("");
		return `<p class="ok">✅ Token worked — fetched ${records.length} Lead(s) as the current user:</p>
			<table><thead><tr><th>Name</th><th>Company</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
	} catch (err) {
		return `<p class="err">Callback errored: ${escapeHtml(err instanceof Error ? err.message : String(err))}</p>`;
	}
}

function readRawBody(req) {
	return new Promise((resolve) => {
		let data = "";
		req.on("data", (chunk) => (data += chunk));
		req.on("end", () => resolve(data));
	});
}

function row(label, value) {
	return `<tr><th>${escapeHtml(label)}</th><td>${
		value == null || value === "" ? '<span class="muted">—</span>' : escapeHtml(String(value))
	}</td></tr>`;
}

function escapeHtml(s) {
	return String(s)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

/**
 * Renders the RS Living Benefits CoPilot chat experience as a self-contained
 * page, seeded with the identity Salesforce pushed in via the signed request.
 *
 * Beyond canned policy answers, it can answer LIVE data questions ("leads I
 * own", "accounts I can see", "open opportunities") by POSTing to the same-origin
 * /api/canvas-query proxy, which runs a whitelisted SOQL query as the current
 * user using the OAuth token from the signed request — the same mechanism the
 * diagnostic page uses for its Lead table.
 *
 * SECURITY NOTE: the token + instanceUrl are embedded in the page so follow-up
 * chat turns (which carry no new signed request) can still query. This is
 * acceptable here because the user is viewing their OWN session inside the
 * Canvas iframe; the token is short-lived and scoped to the ECA's OAuth scopes.
 * For hardening, keep the token server-side (a session cookie keyed to a signed
 * request) instead of inlining it.
 */
function chatPage({ user, params, oauthToken, instanceUrl }) {
	const fullName = user.fullName || user.userName || "";
	const greeting = fullName ? `Welcome, ${escapeHtml(fullName)}. ` : "";
	const recordId = params.recordId ? escapeHtml(String(params.recordId)) : "";
	const source = escapeHtml(String(params.source || "canvas"));
	// JSON-encode for safe embedding in the inline script.
	const boot = JSON.stringify({
		token: oauthToken || "",
		instanceUrl: instanceUrl || "",
		userId: user.userId || "",
		hasToken: Boolean(oauthToken && instanceUrl),
	}).replace(/</g, "\\u003c");

	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>Living Benefits Assistant</title>
	<style>
		* { box-sizing: border-box; }
		html, body { margin: 0; padding: 0; height: 100%; }
		body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1a2a3a; background: #fff; }
		.chat-layout { display: flex; height: 100vh; min-height: 560px; }
		.sidebar { width: 260px; flex-shrink: 0; background: #f4f5f7; border-right: 1px solid #e3e3e3; padding: 20px; overflow-y: auto; }
		.badge { display: inline-block; background: #e8effb; color: #2b6cb0; border-radius: 6px; padding: 4px 10px; font-size: 12px; font-weight: 700; margin-bottom: 14px; }
		.ctx-card { background: #fbfbe6; border: 1px solid #ececc4; border-radius: 8px; padding: 12px 14px; font-size: 13px; color: #6b6320; }
		.ctx-card b { color: #4a4514; }
		.divider { border: none; border-top: 1px solid #e3e3e3; margin: 18px 0; }
		.side-btn { width: 100%; padding: 11px 14px; font-size: 14px; border: 1px solid #e3e3e3; border-radius: 8px; background: #fff; cursor: pointer; margin-bottom: 10px; text-align: left; }
		.side-btn:hover { background: #f0f1f3; }
		.status-title { font-size: 15px; font-weight: 700; margin: 8px 0 12px; }
		.status-pill { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-radius: 8px; font-size: 14px; background: #e5f6e8; color: #2f7d3a; }
		.chat-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
		.chat-scroll { flex: 1; overflow-y: auto; padding: 28px 40px; }
		.assistant-heading { display: flex; align-items: center; gap: 12px; }
		.assistant-heading h1 { font-size: 30px; font-weight: 700; margin: 0; }
		.subtitle { font-size: 15px; color: #4a5a6a; margin: 8px 0 24px; }
		.msg-row { display: flex; gap: 12px; margin-bottom: 22px; }
		.msg-avatar { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 17px; flex-shrink: 0; background: #f2f3f5; }
		.msg-row.assistant .msg-avatar { background: #f6a623; }
		.msg-row.user .msg-avatar { background: #e8503a; }
		.msg-body { flex: 1; min-width: 0; }
		.msg-row.user .msg-content { background: #f4f5f7; border-radius: 8px; padding: 12px 16px; }
		.msg-content { font-size: 15px; line-height: 1.6; }
		.msg-content p { margin: 0 0 12px; }
		.msg-content ol { padding-left: 20px; } .msg-content li { margin-bottom: 8px; }
		.likely { font-size: 22px; font-weight: 700; margin: 2px 0 12px; }
		.typing { color: #8a94a0; font-style: italic; }
		.chat-input-bar { display: flex; align-items: center; gap: 10px; padding: 16px 40px; border-top: 1px solid #eee; }
		.chat-input { flex: 1; padding: 15px 18px; font-size: 15px; border: 1px solid #e3e3e3; border-radius: 10px; background: #f4f5f7; outline: none; }
		.chat-input:focus { box-shadow: 0 0 0 2px #f3c9c2; }
		.send-btn { width: 42px; height: 42px; border-radius: 8px; border: 1px solid #e3e3e3; background: #fff; font-size: 18px; cursor: pointer; }
		.send-btn:disabled { opacity: .5; cursor: default; }

		/* Compact action bar shown only when the sidebar is hidden (narrow panels
		   like the utility bar) so View Policies + data shortcuts stay reachable. */
		.chat-actions { display: none; gap: 8px; flex-wrap: wrap; padding: 12px 40px; border-bottom: 1px solid #eee; }
		.chat-actions button { padding: 8px 12px; font-size: 13px; border: 1px solid #e3e3e3; border-radius: 8px; background: #fff; cursor: pointer; white-space: nowrap; }
		.chat-actions button:hover { background: #f0f1f3; }
		@media (max-width: 720px) {
			.sidebar { display: none; }
			.chat-actions { display: flex; }
			.chat-scroll, .chat-input-bar, .chat-actions { padding-left: 20px; padding-right: 20px; }
		}

		/* Login screen */
		.login-wrap { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 32px 24px; }
		.login-head { display: flex; align-items: center; gap: 14px; margin-bottom: 32px; }
		.login-head h1 { font-size: 32px; font-weight: 700; margin: 0; }
		.login-card { width: 100%; max-width: 720px; border: 1px solid #e3e3e3; border-radius: 8px; padding: 28px; }
		.login-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 18px; }
		.login-field { display: flex; flex-direction: column; }
		.login-field label { font-size: 14px; font-weight: 600; margin-bottom: 8px; }
		.login-field input { padding: 13px 15px; font-size: 15px; border: none; border-radius: 6px; background: #f2f3f5; outline: none; }
		.login-field input:focus { box-shadow: 0 0 0 2px #b8c4d0; }
		.login-btn { width: 100%; padding: 15px; font-size: 16px; border: 1px solid #e3e3e3; border-radius: 6px; background: #fff; cursor: pointer; }
		.login-btn:hover { background: #f7f8fa; }
		@media (max-width: 640px) { .login-fields { grid-template-columns: 1fr; } }

		/* Policies overlay */
		.policies-panel { position: absolute; inset: 0; background: #fff; z-index: 5; display: flex; flex-direction: column; padding: 24px 32px; overflow-y: auto; }
		.policies-panel h2 { font-size: 26px; margin: 4px 0 16px; display: flex; align-items: center; gap: 10px; }
		.link-btn { background: none; border: none; color: #2b6cb0; cursor: pointer; font-size: 14px; padding: 0; margin-bottom: 8px; text-align: left; }
		.pol-toolbar { display: flex; gap: 10px; margin-bottom: 16px; }
		.pol-search { flex: 1; padding: 11px 14px; font-size: 14px; border: 1px solid #e3e3e3; border-radius: 8px; background: #f4f5f7; outline: none; }
		.pol-btn { padding: 11px 18px; border: 1px solid #e3e3e3; border-radius: 8px; background: #fff; cursor: pointer; }
		.pol-table { width: 100%; border-collapse: collapse; }
		.pol-table th { text-align: left; padding: 8px 10px; border-bottom: 2px solid #e3e3e3; font-size: 13px; color: #4a5a6a; }
		.pol-table td { padding: 8px 10px; border-bottom: 1px solid #eee; font-size: 14px; }
		.pol-table tr:hover td { background: #f7f8fa; cursor: pointer; }
		.pol-badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
		.pol-badge.active { background: #e5f6e8; color: #2f7d3a; }
		.pol-badge.lapsed { background: #fbeaea; color: #b3413a; }
		.pol-badge.pending { background: #fdf6e3; color: #8a6d1a; }
		.mono { font-family: ui-monospace, monospace; font-size: 13px; }
		.hidden { display: none !important; }
	</style>
</head>
<body>
	<!-- Login screen (shown first; any non-blank values log you in — demo only) -->
	<div class="login-wrap" id="loginView">
		<div class="login-head">
			<span aria-hidden="true" style="font-size:36px">🏛️</span>
			<h1>RS Living Benefits CoPilot</h1>
		</div>
		<form class="login-card" onsubmit="return doLogin(event)">
			<div class="login-fields">
				<div class="login-field">
					<label for="policyNo">Policy Number</label>
					<input id="policyNo" type="text" placeholder="Enter your policy number" />
				</div>
				<div class="login-field">
					<label for="agentCode">Agent Code</label>
					<input id="agentCode" type="text" placeholder="Enter your agent code" />
				</div>
			</div>
			<button type="submit" class="login-btn">Login</button>
		</form>
	</div>

	<div class="chat-layout hidden" id="chatView">
		<aside class="sidebar">
			<span class="badge">🏛️ Canvas · ${source}</span>
			<div class="ctx-card">
				Signed-request identity:<br /><b>${fullName ? escapeHtml(fullName) : "—"}</b>
				${recordId ? `<br /><span style="font-size:12px">Record: <b>${recordId}</b></span>` : ""}
			</div>
			<hr class="divider" />
			<h3 class="status-title">Ask about your data</h3>
			<button class="side-btn" onclick="ask('Show leads I own')">📇 Leads I own</button>
			<button class="side-btn" onclick="ask('Accounts I can see')">🏢 Accounts I can see</button>
			<button class="side-btn" onclick="ask('Open opportunities')">💰 Open opportunities</button>
			<button class="side-btn" onclick="openPolicies()">📋 View Policies</button>
			<hr class="divider" />
			<button class="side-btn" onclick="clearChat()">🧹 Clear Chat</button>
			<button class="side-btn" onclick="seedHelp()">💡 What can you do?</button>
			<button class="side-btn" onclick="logout()">🔒 Logout</button>
			<h3 class="status-title">System Status</h3>
			<div class="status-pill" id="dataStatus">🟢 Canvas Connected</div>
		</aside>
		<main class="chat-main">
			<!-- Shown only when the sidebar is hidden (narrow / utility-bar panels) -->
			<div class="chat-actions">
				<button onclick="ask('Show leads I own')">📇 Leads I own</button>
				<button onclick="ask('Accounts I can see')">🏢 Accounts</button>
				<button onclick="ask('Open opportunities')">💰 Opportunities</button>
				<button onclick="openPolicies()">📋 View Policies</button>
				<button onclick="clearChat()">🧹 Clear</button>
				<button onclick="logout()">🔒 Logout</button>
			</div>
			<div class="chat-scroll" id="scroll">
				<div class="assistant-heading">
					<span aria-hidden="true" style="font-size:28px">🏛️</span>
					<h1>Living Benefits Assistant</h1>
				</div>
				<p class="subtitle">${greeting}Ask me anything about the living benefits on your insurance policy!</p>
			</div>
			<form class="chat-input-bar" onsubmit="return send(event)">
				<input class="chat-input" id="input" placeholder="Ask me about your policy..." autocomplete="off" />
				<button type="submit" class="send-btn" id="sendBtn" aria-label="Send">↑</button>
			</form>

			<!-- Policies overlay (fetches same-origin /api/policies) -->
			<div class="policies-panel hidden" id="policiesPanel">
				<button class="link-btn" onclick="closePolicies()">← Back to chat</button>
				<h2><span aria-hidden="true">🏛️</span> Policies</h2>
				<form class="pol-toolbar" onsubmit="return searchPolicies(event)">
					<input class="pol-search" id="polSearch" placeholder="Search by name, policy #, or agent code…" />
					<button type="submit" class="pol-btn">Search</button>
				</form>
				<div id="polBody"><p class="muted">Loading policies…</p></div>
			</div>
		</main>
	</div>

	<script>
		var BOOT = ${boot};
		var scroll = document.getElementById("scroll");
		var input = document.getElementById("input");
		var sendBtn = document.getElementById("sendBtn");
		var greetingHtml = scroll.innerHTML;
		var statusEl = document.getElementById("dataStatus");
		if (!BOOT.hasToken && statusEl) {
			statusEl.textContent = "🟡 No live token — data queries disabled";
			statusEl.style.background = "#fdf6e3"; statusEl.style.color = "#8a6d1a";
		}

		function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

		// Map a natural-language question to a whitelisted data resource, or null.
		function detectResource(q){
			var l = q.toLowerCase();
			var mine = /\\b(my|i own|assigned to me|mine)\\b/.test(l);
			if (/lead/.test(l))                        return mine ? "my-leads" : "leads";
			if (/account/.test(l))                     return mine ? "my-accounts" : "accounts";
			if (/opportunit|deal|pipeline/.test(l))    return "opportunities";
			if (/contact/.test(l))                     return "contacts";
			return null;
		}

		function reply(q){
			var l = q.toLowerCase();
			if (l.indexOf("what can you do") > -1 || l.indexOf("help") > -1) {
				return "<p><strong>Two things I can do:</strong></p>"
					+ "<p><strong>1 — Answer questions about your living-benefit policy</strong> (Prudential variable annuity + rider): terminology (Account Value, PWV, ABWA), mechanics (roll-ups, step-ups, RMDs), what-if scenarios, and next steps.</p>"
					+ "<p><strong>2 — Pull your live Salesforce data.</strong> Try:</p>"
					+ "<ol><li>\\"Show <strong>leads I own</strong>\\"</li><li>\\"<strong>Accounts I can see</strong>\\"</li><li>\\"<strong>Open opportunities</strong>\\"</li><li>\\"Recent <strong>contacts</strong>\\"</li></ol>"
					+ "<p>Data is queried live as <strong>you</strong>, so it respects your Salesforce sharing and field-level security.</p>"
					+ "<p>You can also ask to see your <strong>policies</strong> — e.g. \\"show my policies\\".</p>";
			}
			return "<p>I'd be happy to help with that. For policy specifics I'd pull from your contract details and living-benefit spec sheet. You can also ask for your <strong>Salesforce data</strong> — e.g. <em>\\"leads I own\\"</em>, <em>\\"accounts I can see\\"</em>, or <em>\\"open opportunities\\"</em>. For <em>\\"" + esc(q) + "\\"</em> I don't have that data connected yet.</p>";
		}

		function addUser(text){
			var row = document.createElement("div");
			row.className = "msg-row user";
			row.innerHTML = '<div class="msg-avatar">🧑</div><div class="msg-body"><div class="msg-content">' + esc(text) + '</div></div>';
			scroll.appendChild(row);
			scroll.scrollTop = scroll.scrollHeight;
		}
		function addAssistant(html){
			var row = document.createElement("div");
			row.className = "msg-row assistant";
			row.innerHTML = '<div class="msg-avatar">🏦</div><div class="msg-body"><h2 class="likely">Likely Answer</h2><div class="msg-content">' + html + '</div></div>';
			scroll.appendChild(row);
			scroll.scrollTop = scroll.scrollHeight;
		}
		function addTyping(msg){
			var row = document.createElement("div");
			row.className = "msg-row assistant"; row.id = "typing";
			row.innerHTML = '<div class="msg-avatar">🏦</div><div class="msg-body"><div class="msg-content typing">' + (msg || "Thinking…") + '</div></div>';
			scroll.appendChild(row);
			scroll.scrollTop = scroll.scrollHeight;
		}
		function removeTyping(){ var t = document.getElementById("typing"); if (t) t.remove(); }

		function renderTable(data){
			if (data.error) return '<p style="color:#b3413a"><strong>Couldn\\'t load that:</strong> ' + esc(data.error) + '</p>';
			if (!data.rows || !data.rows.length) return '<p>✅ Query ran, but <strong>' + esc(data.label) + '</strong> returned no records.</p>';
			var head = data.columns.map(function(c){ return '<th style="text-align:left;padding:6px 10px;border-bottom:2px solid #e3e3e3;font-size:13px;color:#4a5a6a">' + esc(c) + '</th>'; }).join("");
			var rows = data.rows.map(function(r){
				return '<tr>' + r.map(function(cell){ return '<td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:14px">' + esc(cell) + '</td>'; }).join("") + '</tr>';
			}).join("");
			return '<p>✅ Here are your <strong>' + esc(data.label) + '</strong> (' + data.count + '):</p>'
				+ '<table style="width:100%;border-collapse:collapse;margin-top:6px"><thead><tr>' + head + '</tr></thead><tbody>' + rows + '</tbody></table>';
		}

		function fetchData(resource){
			return fetch("/api/canvas-query", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ token: BOOT.token, instanceUrl: BOOT.instanceUrl, ownerId: BOOT.userId, resource: resource })
			}).then(function(r){ return r.json(); });
		}

		// Detect an inline "policies" question (distinct from the SF-data resources).
		function isPolicyQuestion(q){
			var l = q.toLowerCase();
			return /\\b(policy|policies|policyholder|policy holder)\\b/.test(l);
		}
		function renderPolicyRows(list){
			if (!list || !list.length) return '<p>No policies found.</p>';
			var rows = list.map(function(p){
				var st = String(p.status || "").toLowerCase();
				return '<tr><td class="mono">' + esc(p.id) + '</td><td>' + esc(p.holderName) + '</td>'
					+ '<td>' + esc(p.productType) + '</td>'
					+ '<td><span class="pol-badge ' + st + '">' + esc(p.status) + '</span></td>'
					+ '<td>' + esc(money(p.accountValue)) + '</td></tr>';
			}).join("");
			return '<p>✅ Here are the <strong>policies</strong> (' + list.length + '). '
				+ 'Open <strong>📋 View Policies</strong> for search &amp; details:</p>'
				+ '<table class="pol-table"><thead><tr><th>Policy #</th><th>Holder</th><th>Product</th><th>Status</th><th>Account Value</th></tr></thead><tbody>'
				+ rows + '</tbody></table>';
		}

		function ask(text){
			if (!text) return;
			addUser(text);
			input.value = "";
			sendBtn.disabled = true;

			// Inline policies answer (fetches same-origin /api/policies).
			if (isPolicyQuestion(text)) {
				addTyping("Loading policies…");
				fetch("/api/policies").then(function(r){ return r.json(); }).then(function(d){
					removeTyping(); addAssistant(renderPolicyRows(d.policies || []));
					sendBtn.disabled = false; input.focus();
				}).catch(function(err){
					removeTyping();
					addAssistant('<p style="color:#b3413a">Failed to load policies: ' + esc(String(err)) + '</p>');
					sendBtn.disabled = false; input.focus();
				});
				return;
			}

			var resource = detectResource(text);
			if (resource && BOOT.hasToken) {
				addTyping("Querying Salesforce…");
				fetchData(resource).then(function(data){
					removeTyping(); addAssistant(renderTable(data));
					sendBtn.disabled = false; input.focus();
				}).catch(function(err){
					removeTyping();
					addAssistant('<p style="color:#b3413a">Request failed: ' + esc(String(err)) + '</p>');
					sendBtn.disabled = false; input.focus();
				});
				return;
			}
			if (resource && !BOOT.hasToken) {
				addTyping();
				setTimeout(function(){
					removeTyping();
					addAssistant("<p>That's a live-data question, but there's <strong>no OAuth token</strong> in this session — open me as the Canvas app inside Salesforce so the signed request provides one.</p>");
					sendBtn.disabled = false; input.focus();
				}, 400);
				return;
			}
			addTyping();
			setTimeout(function(){
				removeTyping(); addAssistant(reply(text));
				sendBtn.disabled = false; input.focus();
			}, 600);
		}
		function send(e){ e.preventDefault(); ask(input.value.trim()); return false; }
		function clearChat(){ scroll.innerHTML = greetingHtml; }
		function seedHelp(){ ask("What can you do?"); }

		// ---- Login / logout ----
		var loginView = document.getElementById("loginView");
		var chatView = document.getElementById("chatView");
		function doLogin(e){
			e.preventDefault();
			// Demo: any values (or none) log you in, mirroring the React app.
			loginView.classList.add("hidden");
			chatView.classList.remove("hidden");
			input.focus();
			return false;
		}
		function logout(){
			closePolicies();
			chatView.classList.add("hidden");
			loginView.classList.remove("hidden");
		}

		// ---- Policies (same-origin /api/policies) ----
		var policiesPanel = document.getElementById("policiesPanel");
		var polBody = document.getElementById("polBody");
		var polSearch = document.getElementById("polSearch");
		var polLoaded = false;

		function money(n){ return (typeof n === "number") ? n.toLocaleString("en-US", { style: "currency", currency: "USD" }) : ""; }

		function renderPolicies(list){
			if (!list || !list.length) { polBody.innerHTML = '<p class="muted">No policies match your search.</p>'; return; }
			var rows = list.map(function(p){
				var st = String(p.status || "").toLowerCase();
				return '<tr onclick="showPolicy(\\'' + esc(p.id) + '\\')">'
					+ '<td class="mono">' + esc(p.id) + '</td>'
					+ '<td>' + esc(p.holderName) + '</td>'
					+ '<td>' + esc(p.productType) + '</td>'
					+ '<td><span class="pol-badge ' + st + '">' + esc(p.status) + '</span></td>'
					+ '<td>' + esc(money(p.accountValue)) + '</td></tr>';
			}).join("");
			polBody.innerHTML = '<table class="pol-table"><thead><tr>'
				+ '<th>Policy #</th><th>Holder</th><th>Product</th><th>Status</th><th>Account Value</th>'
				+ '</tr></thead><tbody>' + rows + '</tbody></table>';
		}

		function loadPolicies(q){
			polBody.innerHTML = '<p class="muted">Loading policies…</p>';
			var url = "/api/policies" + (q ? ("?q=" + encodeURIComponent(q)) : "");
			fetch(url).then(function(r){ return r.json(); }).then(function(d){
				renderPolicies(d.policies || []);
			}).catch(function(err){
				polBody.innerHTML = '<p style="color:#b3413a">✖ Failed to load policies: ' + esc(String(err)) + '</p>';
			});
		}

		function openPolicies(){
			policiesPanel.classList.remove("hidden");
			if (!polLoaded) { polLoaded = true; loadPolicies(""); }
		}
		function closePolicies(){ policiesPanel.classList.add("hidden"); }
		function searchPolicies(e){ e.preventDefault(); loadPolicies(polSearch.value.trim()); return false; }

		function showPolicy(id){
			polBody.innerHTML = '<p class="muted">Loading policy…</p>';
			fetch("/api/policy/" + encodeURIComponent(id)).then(function(r){ return r.json(); }).then(function(d){
				var p = d.policy; if (!p) { polBody.innerHTML = '<p style="color:#b3413a">Not found.</p>'; return; }
				var st = String(p.status || "").toLowerCase();
				polBody.innerHTML = '<button class="link-btn" onclick="loadPolicies(\\'\\')">← Back to list</button>'
					+ '<div style="border:1px solid #e3e3e3;border-radius:8px;padding:20px;margin-top:8px">'
					+ '<h3 style="margin:0 0 4px;font-size:22px">' + esc(p.holderName) + ' <span class="pol-badge ' + st + '">' + esc(p.status) + '</span></h3>'
					+ '<p class="muted" style="margin:0 0 16px">' + esc(p.id) + ' · ' + esc(p.productType) + '</p>'
					+ '<table class="pol-table"><tbody>'
					+ '<tr><td>Account Value</td><td>' + esc(money(p.accountValue)) + '</td></tr>'
					+ '<tr><td>Protected Withdrawal Value</td><td>' + esc(money(p.protectedWithdrawalValue)) + '</td></tr>'
					+ '<tr><td>Annual Benefit Withdrawal</td><td>' + esc(money(p.annualBenefitWithdrawalAmount)) + '</td></tr>'
					+ '<tr><td>Rider Anniversary</td><td>' + esc(p.riderAnniversary) + '</td></tr>'
					+ '<tr><td>Agent Code</td><td>' + esc(p.agentCode) + '</td></tr>'
					+ '</tbody></table></div>';
			}).catch(function(err){
				polBody.innerHTML = '<p style="color:#b3413a">✖ ' + esc(String(err)) + '</p>';
			});
		}

		document.getElementById("policyNo").focus();
	</script>
</body>
</html>`;
}

function page(title, inner) {
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>${escapeHtml(title)}</title>
	<style>
		body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1a2a3a; margin: 0; padding: 32px; background: #fff; }
		h1 { display: flex; align-items: center; gap: 12px; font-size: 28px; }
		h2 { font-size: 18px; margin: 0 0 12px; }
		.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
		section { border: 1px solid #e3e3e3; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
		table { width: 100%; border-collapse: collapse; }
		th { text-align: left; width: 40%; padding: 6px 8px; color: #4a5a6a; font-weight: 600; vertical-align: top; }
		td { padding: 6px 8px; font-family: ui-monospace, monospace; font-size: 13px; word-break: break-all; }
		tr:nth-child(odd) { background: #f7f8fa; }
		.muted { color: #9aa5b1; }
		.ok { color: #2f7d3a; font-weight: 600; }
		.err { color: #b3413a; font-weight: 600; }
		pre { background: #0f1720; color: #d6e2f0; padding: 16px; border-radius: 8px; overflow: auto; font-size: 12px; }
		details { border: 1px solid #e3e3e3; border-radius: 8px; padding: 16px; }
		summary { cursor: pointer; font-weight: 600; }
		@media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
	</style>
</head>
<body>
	<h1>🏛️ ${escapeHtml(title)}</h1>
	${inner}
</body>
</html>`;
}