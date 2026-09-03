import { listPolicies } from "./_data/policies.js";
import { applyCors } from "./_data/cors.js";

/**
 * GET /api/policies
 * Optional query params:
 *   ?q=<search>        match holderName / id / agentCode
 *   ?status=<status>   filter by status (Active, Lapsed, Pending)
 */
export default function handler(req, res) {
	if (applyCors(req, res)) return;

	if (req.method !== "GET") {
		res.setHeader("Allow", "GET");
		res.status(405).json({ error: "Method not allowed" });
		return;
	}

	const { q, status } = req.query ?? {};
	const data = listPolicies({ q, status });

	res.status(200).json({ count: data.length, policies: data });
}