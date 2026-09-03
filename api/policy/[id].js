import { getPolicy } from "../_data/policies.js";
import { applyCors } from "../_data/cors.js";

/**
 * GET /api/policy/:id
 * Returns a single policy, or 404 if not found.
 */
export default function handler(req, res) {
	if (applyCors(req, res)) return;

	if (req.method !== "GET") {
		res.setHeader("Allow", "GET");
		res.status(405).json({ error: "Method not allowed" });
		return;
	}

	const { id } = req.query ?? {};
	const policy = getPolicy(id);

	if (!policy) {
		res.status(404).json({ error: `Policy '${id}' not found` });
		return;
	}

	res.status(200).json({ policy });
}