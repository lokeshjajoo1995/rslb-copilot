import { useState, useRef, useEffect } from "react";
import Policies from "./Policies";
import { useMfeHost, type AccountContext } from "./useMfeHost";
import { detectResource, runQuery, type QueryResult } from "./mfeQuery";
import { fetchPolicies, type Policy } from "./api";
import "./App.css";

const money = (n: number): string =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** Detect an inline "policies" question. */
function isPolicyQuestion(q: string): boolean {
  return /\b(policy|policies|policyholder|policy holder)\b/i.test(q);
}

type Role = "user" | "assistant";
interface Message {
  role: Role;
  content: React.ReactNode;
}

/* ---- Login view ---- */
function Login({ onLogin }: { onLogin: () => void }) {
  const [policyNumber, setPolicyNumber] = useState("");
  const [agentCode, setAgentCode] = useState("");

  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Any non-blank values log you in (demo only).
    onLogin();
  };

  return (
    <div className="page">
      <header className="header">
        <span className="header-icon" aria-hidden="true">🏛️</span>
        <h1 className="header-title">RS Living Benefits CoPilot</h1>
      </header>

      <form className="card" onSubmit={handleLogin}>
        <div className="fields">
          <div className="field">
            <label htmlFor="policy">Policy Number</label>
            <input
              id="policy"
              type="text"
              placeholder="Enter your policy number"
              value={policyNumber}
              onChange={(e) => setPolicyNumber(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="agent">
              <span className="help" title="Your assigned agent code">?</span> Agent Code
            </label>
            <input
              id="agent"
              type="text"
              placeholder="Enter your agent code"
              value={agentCode}
              onChange={(e) => setAgentCode(e.target.value)}
            />
          </div>
        </div>

        <button type="submit" className="login-btn">Login</button>
      </form>
    </div>
  );
}

/* ---- Canned assistant reply ---- */
function getAssistantReply(question: string): React.ReactNode {
  const q = question.toLowerCase();
  if (q.includes("what can you do") || q.includes("help")) {
    return (
      <>
        <p>
          <strong>
            In short, I can help you with any question you have about a Prudential
            variable annuity contract and its associated living-benefit rider.
          </strong>
          <br />
          Specifically, I can:
        </p>
        <ol>
          <li><strong>Explain policy terminology</strong> – e.g., what your Account Value, Protected Withdrawal Value (PWV), Annual Benefit Withdrawal Amount (ABWA), etc., mean and how they change over time.</li>
          <li><strong>Illustrate benefit mechanics</strong> – for instance, how roll-ups, step-ups, withdrawal percentages, age-banding, and Required Minimum Distributions (RMDs) affect your rider.</li>
          <li><strong>Run "what-if" scenarios</strong> – such as the impact of a partial withdrawal, excess withdrawal, market movement, or adding additional premium (if allowed).</li>
          <li><strong>Clarify contract rules</strong> – e.g., eligible investment options, resets, termination provisions, beneficiary payout, and rider fees.</li>
          <li><strong>Walk through next steps</strong> – including how to request a withdrawal, initiate income, add or change systematic withdrawals, or update beneficiaries.</li>
          <li><strong>Provide date-oriented insight</strong> – like when the next rider anniversary occurs, when the earliest income date could be, or when fees are deducted.</li>
          <li><strong>Break down statements</strong> – helping you reconcile the numbers on your quarterly/annual statement with the rider's mechanics.</li>
          <li><strong>Summarize recent activity</strong> – contributions, transfers, withdrawals, fees, benefit base changes, and market performance (as long as the data is provided to me).</li>
        </ol>
        <p>
          Everything I relay is{" "}
          <strong>strictly sourced from the contract details and the living-benefit spec sheet you provide</strong>
          —no guesswork or outside assumptions.
        </p>
        <p>
          I can also pull your <strong>live Salesforce data</strong> — try{" "}
          <em>"leads I own"</em>, <em>"accounts I can see"</em>, or{" "}
          <em>"open opportunities"</em>. That runs as <strong>you</strong> through
          the MFE bridge, so it respects your sharing and field-level security.
        </p>
      </>
    );
  }
  return (
    <p>
      I'd be happy to help with that. To give you an accurate answer I'd normally
      pull the specifics from your policy's contract details and living-benefit
      spec sheet. Once that data is connected, I can break down the numbers and
      walk you through exactly how it applies to <em>"{question}"</em>.
    </p>
  );
}

/* ---- Live data table (from bridge.graphql via mfeQuery) ---- */
function DataTable({ data }: { data: QueryResult }) {
  if (data.error) {
    return <p style={{ color: "#b3413a" }}><strong>Couldn't load that:</strong> {data.error}</p>;
  }
  if (!data.rows.length) {
    return <p>✅ Query ran, but <strong>{data.label}</strong> returned no records.</p>;
  }
  return (
    <>
      <p>✅ Here are your <strong>{data.label}</strong> ({data.count}):</p>
      <table className="data-table">
        <thead>
          <tr>{data.columns.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {data.rows.map((r, i) => (
            <tr key={i}>{r.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/* ---- Inline policies table (fetched from /api/policies) ---- */
function PoliciesTable({ list, onOpenPolicies }: { list: Policy[]; onOpenPolicies: () => void }) {
  if (!list.length) return <p>No policies found.</p>;
  return (
    <>
      <p>
        ✅ Here are the <strong>policies</strong> ({list.length}).{" "}
        <button className="link-inline" onClick={onOpenPolicies}>Open full view</button> for search &amp; details:
      </p>
      <table className="data-table">
        <thead>
          <tr><th>Policy #</th><th>Holder</th><th>Product</th><th>Status</th><th>Account Value</th></tr>
        </thead>
        <tbody>
          {list.map((p) => (
            <tr key={p.id}>
              <td className="mono">{p.id}</td>
              <td>{p.holderName}</td>
              <td>{p.productType}</td>
              <td><span className={`badge ${p.status.toLowerCase()}`}>{p.status}</span></td>
              <td>{money(p.accountValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/* ---- Account context panel (data pushed from the host record page) ---- */
function AccountPanel({
  account,
  pageUrl,
}: {
  account: AccountContext | null;
  pageUrl: string | null;
}) {
  // Only shown when the host sent an Account (i.e. placed on an Account record
  // page). On the utility bar there is no account, so this renders nothing.
  if (!account) return null;
  return (
    <section className="account-panel">
      <h3 className="account-panel-title">📇 Account in context</h3>
      <dl className="account-fields">
        <div>
          <dt>Name</dt>
          <dd>{account.name || "—"}</dd>
        </div>
        <div>
          <dt>Id</dt>
          <dd className="mono">{account.id}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{account.email || "—"}</dd>
        </div>
      </dl>
      {pageUrl && (
        <p className="account-source">
          from{" "}
          <a href={pageUrl} target="_blank" rel="noreferrer">
            this Salesforce page
          </a>
        </p>
      )}
    </section>
  );
}

/* ---- Chat view ---- */
function Chat({
  onLogout,
  onOpenPolicies,
}: {
  onLogout: () => void;
  onOpenPolicies: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const { connected, userId, leadName, account, pageUrl } = useMfeHost();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const ask = (rawText: string) => {
    const text = rawText.trim();
    if (!text || thinking) return;
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setThinking(true);

    // Inline policies answer (same-origin /api/policies — works standalone too).
    if (isPolicyQuestion(text)) {
      fetchPolicies()
        .then((list) => {
          setMessages((m) => [...m, {
            role: "assistant",
            content: <PoliciesTable list={list} onOpenPolicies={onOpenPolicies} />,
          }]);
          setThinking(false);
        })
        .catch((err: unknown) => {
          setMessages((m) => [...m, {
            role: "assistant",
            content: <p style={{ color: "#b3413a" }}>Failed to load policies: {String(err)}</p>,
          }]);
          setThinking(false);
        });
      return;
    }

    const resource = detectResource(text);
    // Live-data path: query Salesforce through the bridge (host session, no token).
    if (resource && connected) {
      runQuery(resource, userId).then((data) => {
        setMessages((m) => [...m, { role: "assistant", content: <DataTable data={data} /> }]);
        setThinking(false);
      });
      return;
    }
    if (resource && !connected) {
      setTimeout(() => {
        setMessages((m) => [...m, {
          role: "assistant",
          content: <p>That's a live-data question, but the MFE bridge isn't connected (open me inside Salesforce via the shell so <code>bridge.graphql()</code> can query as you — no token needed).</p>,
        }]);
        setThinking(false);
      }, 400);
      return;
    }
    // Otherwise: canned policy reply.
    setTimeout(() => {
      setMessages((m) => [...m, { role: "assistant", content: getAssistantReply(text) }]);
      setThinking(false);
    }, 700);
  };

  const send = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    ask(input);
  };

  return (
    <div className="chat-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="policy-banner">Policy data not available</div>
        <hr className="divider" />
        <div className="sidebar-actions">
          <button className="side-btn" onClick={() => setMessages([])}>Clear Chat</button>
          <button className="side-btn" onClick={onLogout}>Logout</button>
        </div>
        <button className="side-btn" onClick={onOpenPolicies}>📋 View Policies</button>
        <h3 className="status-title">Ask about your data</h3>
        <button className="side-btn" onClick={() => ask("Show leads I own")}>📇 Leads I own</button>
        <button className="side-btn" onClick={() => ask("Accounts I can see")}>🏢 Accounts I can see</button>
        <button className="side-btn" onClick={() => ask("Open opportunities")}>💰 Open opportunities</button>
        <h3 className="status-title">System Status</h3>
        <div className={`status-pill ${connected ? "online" : ""}`}>
          {connected ? "🟢 MFE Bridge Connected" : "🟡 Bridge not connected"}
        </div>
      </aside>

      {/* Main */}
      <main className="chat-main">
        <div className="chat-scroll">
          <div className="error-banner">✖ Failed to load policy data</div>
          <div className="assistant-heading">
            <span className="header-icon" aria-hidden="true">🏛️</span>
            <h1>Living Benefits Assistant</h1>
          </div>
          <p className="assistant-subtitle">
            {leadName ? `Welcome — viewing ${leadName}. ` : ""}
            Ask about your policy, your live Salesforce data (e.g. "leads I own", "open opportunities"), or "show my policies".
          </p>

          <AccountPanel account={account} pageUrl={pageUrl} />

          {messages.map((msg, i) => (
            <div key={i} className={`msg-row ${msg.role}`}>
              <div className="msg-avatar" aria-hidden="true">
                {msg.role === "user" ? "🧑" : "🏦"}
              </div>
              <div className="msg-body">
                {msg.role === "assistant" && <h2 className="likely-answer">Likely Answer</h2>}
                <div className="msg-content">{msg.content}</div>
              </div>
            </div>
          ))}

          {thinking && (
            <div className="msg-row assistant">
              <div className="msg-avatar" aria-hidden="true">🏦</div>
              <div className="msg-body"><div className="msg-content typing">Thinking…</div></div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form className="chat-input-bar" onSubmit={send}>
          <input
            className="chat-input"
            placeholder="Ask me about your policy..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button type="submit" className="send-btn" aria-label="Send" disabled={thinking}>↑</button>
        </form>
      </main>
    </div>
  );
}

type View = "login" | "chat" | "policies";

export default function App() {
  const [view, setView] = useState<View>("login");

  if (view === "login") {
    return <Login onLogin={() => setView("chat")} />;
  }
  if (view === "policies") {
    return <Policies onBack={() => setView("chat")} />;
  }
  return (
    <Chat
      onLogout={() => setView("login")}
      onOpenPolicies={() => setView("policies")}
    />
  );
}
