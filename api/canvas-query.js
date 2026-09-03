/**
 * Same-origin query proxy for the Canvas chat.
 *
 * The chat page runs inside the Canvas iframe (origin = this Vercel app). Its
 * browser JS cannot call the Salesforce REST API directly — that origin doesn't
 * allow arbitrary CORS. So the chat POSTs here, and this server-side handler
 * makes the Salesforce call using the OAuth token from the signed request,
 * acting AS the current user (so org sharing / FLS are respected).
 *
 * SECURITY: the client never sends raw SOQL. It sends a `resource` keyword that
 * maps to a fixed, whitelisted query below — so there's no SOQL injection
 * surface. An optional ownerId (validated as a Salesforce Id) scopes "my"
 * queries to the current user.
 */
const API_VERSION = "62.0";

// Whitelisted resources → fixed SOQL. `{owner}` is replaced with a validated
// OwnerId filter only when an ownerId is supplied.
const RESOURCES = {
	leads: {
		label: "Recent Leads",
		columns: ["Name", "Company", "Status"],
		soql: "SELECT Id, Name, Company, Status FROM Lead ORDER BY CreatedDate DESC LIMIT 10",
	},
	"my-leads": {
		label: "Leads you own",
		columns: ["Name", "Company", "Status"],
		soql: "SELECT Id, Name, Company, Status FROM Lead WHERE OwnerId = '{owner}' ORDER BY CreatedDate DESC LIMIT 10",
		requiresOwner: true,
	},
	accounts: {
		label: "Accounts you can see",
		columns: ["Name", "Industry", "Type"],
		soql: "SELECT Id, Name, Industry, Type FROM Account ORDER BY LastModifiedDate DESC LIMIT 10",
	},
	"my-accounts": {
		label: "Accounts you own",
		columns: ["Name", "Industry", "Type"],
		soql: "SELECT Id, Name, Industry, Type FROM Account WHERE OwnerId = '{owner}' ORDER BY LastModifiedDate DESC LIMIT 10",
		requiresOwner: true,
	},
	opportunities: {
		label: "Open Opportunities",
		columns: ["Name", "StageName", "Amount", "CloseDate"],
		soql: "SELECT Id, Name, StageName, Amount, CloseDate FROM Opportunity WHERE IsClosed = false ORDER BY CloseDate ASC LIMIT 10",
	},
	contacts: {
		label: "Recent Contacts",
		columns: ["Name", "Title", "Email"],
		soql: "SELECT Id, Name, Title, Email FROM Contact ORDER BY CreatedDate DESC LIMIT 10",
	},
};

export default async function handler(req, res) {
	res.setHeader("Content-Type", "application/json; charset=utf-8");

	if (req.method !== "POST") {
		res.status(405).json({ error: "POST only" });
		return;
	}

	// Body may be pre-parsed JSON or a raw string.
	let body = req.body;
	if (typeof body === "string") {
		try {
			body = JSON.parse(body);
		} catch {
			body = {};
		}
	}
	body = body || {};

	const { token, instanceUrl, resource, ownerId } = body;
	const def = RESOURCES[resource];

	if (!def) {
		res.status(400).json({ error: `Unknown resource "${resource}".` });
		return;
	}
	if (!token || !instanceUrl) {
		res.status(400).json({ error: "Missing token / instanceUrl." });
		return;
	}
	if (def.requiresOwner && !isValidSalesforceId(ownerId)) {
		res.status(400).json({ error: "This query needs a valid ownerId." });
		return;
	}

	const soql = def.soql.replace("{owner}", def.requiresOwner ? ownerId : "");
	const url = `${instanceUrl}/services/data/v${API_VERSION}/query?q=${encodeURIComponent(soql)}`;

	try {
		const resp = await fetch(url, {
			headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
		});
		const text = await resp.text();
		if (!resp.ok) {
			res.status(200).json({ error: `Salesforce returned HTTP ${resp.status}: ${text.slice(0, 300)}` });
			return;
		}
		const data = JSON.parse(text);
		const rows = (data.records ?? []).map((r) =>
			def.columns.map((c) => formatCell(r[c])),
		);
		res.status(200).json({
			label: def.label,
			columns: def.columns,
			rows,
			count: data.totalSize ?? rows.length,
		});
	} catch (err) {
		res.status(200).json({ error: err instanceof Error ? err.message : String(err) });
	}
}

// 15- or 18-char alphanumeric Salesforce Id.
function isValidSalesforceId(id) {
	return typeof id === "string" && /^[a-zA-Z0-9]{15,18}$/.test(id);
}

function formatCell(v) {
	if (v == null) return "";
	if (typeof v === "number") return String(v);
	return String(v);
}