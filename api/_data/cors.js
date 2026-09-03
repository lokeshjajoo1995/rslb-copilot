// Shared CORS helper for the policy API. Returns true if the request was a
// preflight OPTIONS (already responded to) and the caller should stop.
export function applyCors(req, res) {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");
	if (req.method === "OPTIONS") {
		res.status(204).end();
		return true;
	}
	return false;
}