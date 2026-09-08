import { applyCors } from "./_data/cors.js";

/**
 * POST /api/chat
 * Body: {
 *   question: string,
 *   context: { account?: {name,id,email}, cases?: [...], files?: [...] }
 * }
 * Returns: { answer: string }
 *
 * Rule-based (no LLM, no API key): interprets the question against the context
 * the CoPilot guest already has (account / cases / files) and returns a
 * plain-language answer. This is the SAME seam a real LLM would plug into —
 * swap the body for an Anthropic call (question + context → completion) later
 * without changing the guest. Safe for demos with no external creds.
 */
export default function handler(req, res) {
	if (applyCors(req, res)) return;

	if (req.method !== "POST") {
		res.setHeader("Allow", "POST");
		res.status(405).json({ error: "Method not allowed" });
		return;
	}

	const question = typeof req.body?.question === "string" ? req.body.question : "";
	const ctx = req.body?.context ?? {};
	const account = ctx.account ?? null;
	const cases = Array.isArray(ctx.cases) ? ctx.cases : [];
	const files = Array.isArray(ctx.files) ? ctx.files : [];

	res.status(200).json({ answer: answer(question, { account, cases, files }) });
}

function answer(question, { account, cases, files }) {
	const q = question.toLowerCase().trim();

	if (!q) return "Ask me about this account's cases, files, or details.";

	// Help / capabilities
	if (/\b(help|what can you|how do you|capabilities)\b/.test(q)) {
		return [
			"I can answer questions about the account you're viewing. Try:",
			"• “summarize the cases” — a rundown of the open cases",
			"• “any high priority cases?” — filter by priority",
			"• “how many open cases?” — counts by status",
			"• “list the files” — documents linked to this account",
			"• “whose account is this?” — account details",
		].join("\n");
	}

	// Account details
	if (/\b(account|who|whose|contact|email|name)\b/.test(q) && !/case|file/.test(q)) {
		if (!account) return "There's no account in context right now.";
		const bits = [`This is ${account.name || "the account"}.`];
		if (account.email) bits.push(`Contact email: ${account.email}.`);
		if (account.id) bits.push(`Record id: ${account.id}.`);
		return bits.join(" ");
	}

	// Files
	if (/\b(file|files|document|documents|attachment|attachments)\b/.test(q)) {
		if (files.length === 0) return "There are no files linked to this account.";
		const list = files
			.map((f) => `• ${f.title || "(untitled)"} (${(f.fileType || "file").toUpperCase()})`)
			.join("\n");
		return `${files.length} file${files.length === 1 ? "" : "s"} linked to this account:\n${list}`;
	}

	// Cases — the main subject
	if (/\b(case|cases|ticket|tickets|issue|issues)\b/.test(q) || cases.length) {
		if (cases.length === 0) return "There are no cases for this account.";

		// high priority?
		if (/\b(high|urgent|critical|priority)\b/.test(q)) {
			const high = cases.filter((c) => /high|urgent|critical/i.test(c.priority || ""));
			if (high.length === 0) return "No high-priority cases right now.";
			const list = high.map((c) => `• ${c.caseNumber}: ${c.subject} [${c.priority}]`).join("\n");
			return `${high.length} high-priority case${high.length === 1 ? "" : "s"}:\n${list}`;
		}

		// open / status counts
		if (/\b(open|status|how many|count|new|closed)\b/.test(q)) {
			const byStatus = countBy(cases, (c) => c.status || "Unspecified");
			const open = cases.filter((c) => !/closed|resolved/i.test(c.status || "")).length;
			return `${cases.length} case${cases.length === 1 ? "" : "s"} total, ${open} open. By status: ${describe(byStatus)}.`;
		}

		// default: summarize
		const lines = [
			`This account has ${cases.length} recent case${cases.length === 1 ? "" : "s"}:`,
		];
		cases.forEach((c, i) => {
			lines.push(`${i + 1}. ${c.caseNumber}: “${c.subject}” [${c.priority || "—"} / ${c.status || "—"}]`);
		});
		return lines.join("\n");
	}

	// Fallback
	return "I can help with this account's cases, files, and details. Ask “what can you do?” for examples.";
}

function countBy(arr, keyFn) {
	const out = {};
	for (const item of arr) {
		const k = keyFn(item);
		out[k] = (out[k] || 0) + 1;
	}
	return out;
}

function describe(counts) {
	return Object.entries(counts)
		.sort((a, b) => b[1] - a[1])
		.map(([k, v]) => `${v} ${k}`)
		.join(", ");
}