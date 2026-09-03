// Typed client for the Vercel serverless backend under /api.
// Same-origin, so no base URL / CORS needed.

export interface Policy {
  id: string;
  holderName: string;
  productType: string;
  status: string;
  accountValue: number;
  protectedWithdrawalValue: number;
  annualBenefitWithdrawalAmount: number;
  riderAnniversary: string;
  agentCode: string;
}

interface PoliciesResponse {
  count: number;
  policies: Policy[];
}

interface PolicyResponse {
  policy: Policy;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // non-JSON error body — keep the default message
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export async function fetchPolicies(params?: {
  q?: string;
  status?: string;
}): Promise<Policy[]> {
  const search = new URLSearchParams();
  if (params?.q) search.set("q", params.q);
  if (params?.status) search.set("status", params.status);
  const qs = search.toString();
  const data = await getJson<PoliciesResponse>(
    `/api/policies${qs ? `?${qs}` : ""}`,
  );
  return data.policies;
}

export async function fetchPolicy(id: string): Promise<Policy> {
  const data = await getJson<PolicyResponse>(
    `/api/policy/${encodeURIComponent(id)}`,
  );
  return data.policy;
}
