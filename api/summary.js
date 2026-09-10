import { applyCors } from "./_data/cors.js";

/**
 * POST /api/summary
 * Body: {
 *   account?: { name, id, email },
 *   cases?:   [{ caseNumber, subject, description, priority, status }],
 *   files?:   [{ title, fileType, sizeBytes, docId }]
 * }
 * Returns: { summary: string }
 *
 * Rule-based (no LLM, no API key): composes a DETAILED account-level briefing
 * across all three context slices the CoPilot holds — account facts, case
 * posture (counts, priority/status breakdown, high-priority + open callouts),
 * and a file overview. This is the "detailed summary" the guest requests when
 * the user asks for it. Same swap-in seam as /api/chat: replace the body with
 * an Anthropic call (context → completion) later without changing the guest.
 */
export default function handler(req, res) {
	if (applyCors(req, res)) return;

	if (req.method !== "POST") {
		res.setHeader("Allow", "POST");
		res.status(405).json({ error: "Method not allowed" });
		return;
	}

	const account = req.body?.account ?? null;
	const cases = Array.isArray(req.body?.cases) ? req.body.cases : [];
	const files = Array.isArray(req.body?.files) ? req.body.files : [];

	res.status(200).json({ summary: buildSummary({ account, cases, files }) });
}

function buildSummary({ account, cases, files }) {
	const sections = [];

	// ---- Account ----
	if (account && (account.name || account.id)) {
		const bits = [`Account: ${norm(account.name) || "(unnamed)"}`];
		if (account.email) bits.push(`contact ${norm(account.email)}`);
		sections.push(bits.join(" — "));
	} else {
		sections.push("Account: no account in context.");
	}

	// ---- Cases ----
	sections.push(summarizeCases(cases));

	// ---- Files ----
	sections.push(summarizeFiles(files));

	// ---- Overall posture (one-line takeaway) ----
	sections.push(takeaway(cases, files));

	return sections.join("\n\n");
}

function summarizeCases(cases) {
	const n = cases.length;
	if (n === 0) return "Cases: none on record for this account.";

	const byPriority = countBy(cases, (c) => norm(c.priority) || "Unspecified");
	const byStatus = countBy(cases, (c) => norm(c.status) || "Unspecified");
	const open = cases.filter((c) => !/closed|resolved/i.test(norm(c.status)));
	const high = cases.filter((c) => /high|urgent|critical/i.test(norm(c.priority)));

	const lines = [];
	lines.push(
		`Cases: ${n} recent case${n === 1 ? "" : "s"}, ${open.length} open` +
			(high.length ? `, ${high.length} high priority.` : "."),
	);
	lines.push(`  • By priority: ${describeCounts(byPriority)}.`);
	lines.push(`  • By status: ${describeCounts(byStatus)}.`);

	if (high.length) {
		lines.push("  • High-priority items:");
		high.forEach((c) => {
			lines.push(`      - ${norm(c.caseNumber) || "Case"}: "${norm(c.subject) || "(no subject)"}" [${norm(c.status) || "—"}]`);
		});
	}

	return lines.join("\n");
}

function summarizeFiles(files) {
	const n = files.length;
	if (n === 0) return "Files: none linked to this account.";

	const byType = countBy(files, (f) => (norm(f.fileType) || "FILE").toUpperCase());
	const totalBytes = files.reduce((sum, f) => sum + (Number(f.sizeBytes) || 0), 0);

	const lines = [];
	lines.push(`Files: ${n} linked (${describeCounts(byType)}), ~${humanSize(totalBytes)} total.`);
	files.slice(0, 5).forEach((f) => {
		lines.push(`  • ${norm(f.title) || "(untitled)"} (${(norm(f.fileType) || "file").toUpperCase()}, ${humanSize(Number(f.sizeBytes) || 0)})`);
	});
	return lines.join("\n");
}

function takeaway(cases, files) {
	const open = cases.filter((c) => !/closed|resolved/i.test(norm(c.status))).length;
	const high = cases.filter((c) => /high|urgent|critical/i.test(norm(c.priority))).length;

	if (high > 0) {
		return `Takeaway: prioritize the ${high} high-priority case${high === 1 ? "" : "s"} — they need attention first.`;
	}
	if (open > 0) {
		return `Takeaway: ${open} open case${open === 1 ? "" : "s"} to work through; no high-priority escalations.`;
	}
	if (cases.length > 0) {
		return "Takeaway: all cases are closed/resolved — account is in good standing.";
	}
	return files.length > 0
		? "Takeaway: no active cases; documents are on file for reference."
		: "Takeaway: quiet account — no active cases or files.";
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
	return Object.entries(counts)
		.sort((a, b) => b[1] - a[1])
		.map(([k, v]) => `${v} ${k}`)
		.join(", ");
}

function norm(v) {
	return typeof v === "string" ? v.trim() : "";
}

function humanSize(bytes) {
	if (!bytes || bytes <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB"];
	let nBytes = bytes;
	let i = 0;
	while (nBytes >= 1024 && i < units.length - 1) {
		nBytes /= 1024;
		i++;
	}
	return `${nBytes.toFixed(nBytes < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}