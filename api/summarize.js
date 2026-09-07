import { applyCors } from "./_data/cors.js";

/**
 * POST /api/summarize
 * Body: { cases: [{ caseNumber, subject, description, priority, status }] }
 *
 * Rule-based (no LLM, no API key): composes a deterministic plain-language
 * summary from the case fields — overall counts, breakdown by priority and
 * status, and a one-line note per case. Safe for demos with no external creds.
 */
export default function handler(req, res) {
	if (applyCors(req, res)) return;

	if (req.method !== "POST") {
		res.setHeader("Allow", "POST");
		res.status(405).json({ error: "Method not allowed" });
		return;
	}

	const cases = Array.isArray(req.body?.cases) ? req.body.cases : [];
	if (cases.length === 0) {
		res.status(200).json({ summary: "There are no cases to summarize for this account." });
		return;
	}

	res.status(200).json({ summary: summarize(cases) });
}

function summarize(cases) {
	const n = cases.length;
	const byPriority = countBy(cases, (c) => norm(c.priority) || "Unspecified");
	const byStatus = countBy(cases, (c) => norm(c.status) || "Unspecified");

	const openLike = cases.filter((c) => !/closed|resolved/i.test(norm(c.status)));
	const highLike = cases.filter((c) => /high|urgent|critical/i.test(norm(c.priority)));

	const lines = [];

	// Headline
	lines.push(
		`This account has ${n} recent case${n === 1 ? "" : "s"}. ` +
			`${openLike.length} still need${openLike.length === 1 ? "s" : ""} attention` +
			(highLike.length ? `, and ${highLike.length} ${highLike.length === 1 ? "is" : "are"} high priority.` : "."),
	);

	// Breakdown
	lines.push(`Priority breakdown: ${describeCounts(byPriority)}.`);
	lines.push(`Status breakdown: ${describeCounts(byStatus)}.`);

	// Per-case one-liners
	lines.push("");
	cases.forEach((c, i) => {
		const subject = norm(c.subject) || "(no subject)";
		const priority = norm(c.priority) || "—";
		const status = norm(c.status) || "—";
		const desc = norm(c.description);
		const snippet = desc ? ` — ${truncate(desc, 120)}` : "";
		lines.push(
			`${i + 1}. ${norm(c.caseNumber) || "Case"}: "${subject}" [${priority} / ${status}]${snippet}`,
		);
	});

	return lines.join("\n");
}

function countBy(arr, keyFn) {
	const out = {};
	for (const item of arr) {
		const k = keyFn(item);
		out[k] = (out[k] || 0) + 1;
	}
	return out;
}

function describeCounts(counts) {
	const parts = Object.entries(counts)
		.sort((a, b) => b[1] - a[1])
		.map(([k, v]) => `${v} ${k}`);
	return parts.join(", ");
}

function norm(v) {
	return typeof v === "string" ? v.trim() : "";
}

function truncate(s, max) {
	return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}