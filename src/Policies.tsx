import { useState, useEffect, useCallback } from "react";
import { fetchPolicies, fetchPolicy, type Policy } from "./api";
import "./Policies.css";

const money = (n: number): string =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/* ---- Detail panel ---- */
function PolicyDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPolicy(id)
      .then((p) => {
        if (!cancelled) setPolicy(p);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="detail">
      <button className="link-btn" onClick={onBack}>
        ← Back to list
      </button>
      {loading && <p className="muted">Loading policy…</p>}
      {error && <p className="error">✖ {error}</p>}
      {policy && (
        <div className="detail-card">
          <div className="detail-head">
            <h2>{policy.holderName}</h2>
            <span className={`badge ${policy.status.toLowerCase()}`}>
              {policy.status}
            </span>
          </div>
          <p className="muted">
            {policy.id} · {policy.productType}
          </p>
          <dl className="detail-grid">
            <div>
              <dt>Account Value</dt>
              <dd>{money(policy.accountValue)}</dd>
            </div>
            <div>
              <dt>Protected Withdrawal Value</dt>
              <dd>{money(policy.protectedWithdrawalValue)}</dd>
            </div>
            <div>
              <dt>Annual Benefit Withdrawal</dt>
              <dd>{money(policy.annualBenefitWithdrawalAmount)}</dd>
            </div>
            <div>
              <dt>Rider Anniversary</dt>
              <dd>{policy.riderAnniversary}</dd>
            </div>
            <div>
              <dt>Agent Code</dt>
              <dd>{policy.agentCode}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}

/* ---- List + search ---- */
export default function Policies({ onBack }: { onBack?: () => void }) {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback((q: string, s: string) => {
    setLoading(true);
    setError(null);
    fetchPolicies({ q: q || undefined, status: s || undefined })
      .then(setPolicies)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(query, status);
    // Only refetch when the status filter changes; search is submit-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const onSearch = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    load(query, status);
  };

  if (selectedId) {
    return (
      <div className="policies-page">
        <PolicyDetail id={selectedId} onBack={() => setSelectedId(null)} />
      </div>
    );
  }

  return (
    <div className="policies-page">
      {onBack && (
        <button className="link-btn" onClick={onBack}>
          ← Back to chat
        </button>
      )}
      <header className="policies-header">
        <span className="header-icon" aria-hidden="true">🏛️</span>
        <h1>Policies</h1>
      </header>

      <form className="policies-toolbar" onSubmit={onSearch}>
        <input
          className="policies-search"
          placeholder="Search by name, policy #, or agent code…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="policies-filter"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="Active">Active</option>
          <option value="Lapsed">Lapsed</option>
          <option value="Pending">Pending</option>
        </select>
        <button type="submit" className="policies-search-btn">
          Search
        </button>
      </form>

      {loading && <p className="muted">Loading policies…</p>}
      {error && <p className="error">✖ {error}</p>}
      {!loading && !error && policies.length === 0 && (
        <p className="muted">No policies match your search.</p>
      )}

      {!loading && !error && policies.length > 0 && (
        <table className="policies-table">
          <thead>
            <tr>
              <th>Policy #</th>
              <th>Holder</th>
              <th>Product</th>
              <th>Status</th>
              <th className="num">Account Value</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((p) => (
              <tr key={p.id} onClick={() => setSelectedId(p.id)}>
                <td className="mono">{p.id}</td>
                <td>{p.holderName}</td>
                <td>{p.productType}</td>
                <td>
                  <span className={`badge ${p.status.toLowerCase()}`}>
                    {p.status}
                  </span>
                </td>
                <td className="num">{money(p.accountValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
