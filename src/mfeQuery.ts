import bridge from "@salesforce/experimental-mfe-bridge";

/**
 * Live Salesforce data for the MFE chat — the counterpart to the Canvas chat's
 * /api/canvas-query proxy, but with a crucial difference:
 *
 *   Canvas: browser JS can't reach Salesforce (CORS), so it POSTs an embedded
 *           OAuth token to a serverless proxy that runs SOQL as the user.
 *   MFE:    bridge.graphql() tunnels through the shell to the HOST, which runs
 *           the query on the user's live session. No token, no proxy, no CORS.
 *
 * The rc.5 lwc-shell has no built-in GraphQL engine, so we patched the vendored
 * shell to RELAY the request to the host LWC, which fulfills it via Apex
 * (RsCoPilotDataService, WITH USER_MODE) and posts the result back. The guest↔host
 * "query" is therefore a whitelisted RESOURCE KEYWORD (not raw GraphQL/SOQL) —
 * the host maps it to a fixed query, so there's no injection surface. The host
 * returns a ready-to-render { label, columns, rows, count } (or { error }).
 */

export interface QueryResult {
	label: string;
	columns: string[];
	rows: string[][];
	count: number;
	error?: string;
}

type ResourceKey =
	| "leads"
	| "my-leads"
	| "accounts"
	| "my-accounts"
	| "opportunities"
	| "contacts";

/** Map a natural-language question to a resource key, or null. */
export function detectResource(q: string): ResourceKey | null {
	const l = q.toLowerCase();
	const mine = /\b(my|i own|assigned to me|mine)\b/.test(l);
	if (/lead/.test(l)) return mine ? "my-leads" : "leads";
	if (/account/.test(l)) return mine ? "my-accounts" : "accounts";
	if (/opportunit|deal|pipeline/.test(l)) return "opportunities";
	if (/contact/.test(l)) return "contacts";
	return null;
}

/**
 * Ask the host for a whitelisted resource. We send the resource keyword as the
 * bridge `query` and the ownerId in `variables`; the patched shell relays it and
 * the host LWC runs Apex as the user. No token is passed.
 */
export async function runQuery(
	resource: ResourceKey,
	ownerId: string | null,
): Promise<QueryResult> {
	try {
		const raw = (await bridge.graphql({
			query: resource, // host↔guest protocol: resource keyword, not GraphQL
			variables: { ownerId: ownerId ?? "" },
		})) as unknown as { data?: unknown; errors?: { message?: string }[] };

		if (raw?.errors && raw.errors.length) {
			return {
				label: resource,
				columns: [],
				rows: [],
				count: 0,
				error: raw.errors.map((e) => e.message || String(e)).join("; "),
			};
		}

		// The host returns a ready-to-render QueryResult as the bridge result.
		const result = (raw?.data ?? raw) as Partial<QueryResult>;
		if (result?.error) {
			return { label: result.label ?? resource, columns: [], rows: [], count: 0, error: result.error };
		}
		return {
			label: result.label ?? resource,
			columns: result.columns ?? [],
			rows: result.rows ?? [],
			count: result.count ?? (result.rows?.length ?? 0),
		};
	} catch (err) {
		return {
			label: resource,
			columns: [],
			rows: [],
			count: 0,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}