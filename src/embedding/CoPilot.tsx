/**
 * CoPilot — the aggregating guest "app" (route /embedding/copilot).
 *
 * Hosted by uiEmbeddingCoPilot, which pushes account + cases + files as flat
 * scalars in one payload. This guest shows:
 *   1. a Login gate (Agent Code + Password) — DEMO ONLY, any non-blank values
 *      log in. NB the host already delivered the data to the iframe before
 *      login; this gate only controls what is DISPLAYED, it is not real auth.
 *   2. after login, CHAT is the main view. The account/cases/files pushed by
 *      the host are the chat's CONTEXT: questions are answered by POSTing
 *      {question, context} to /api/chat (rule-based now, swappable for an LLM).
 *      A collapsible sidebar shows that context (account, cases, files).
 */
import { useState, useRef, useEffect } from 'react'
import { useCoPilotHost, type CaseRecord, type FileRecord } from './useCoPilotHost'
import './embedding.css'
import './copilot.css'

export default function CoPilot() {
  const host = useCoPilotHost()
  const [loggedIn, setLoggedIn] = useState(false)

  if (!loggedIn) {
    return <Login connected={host.connected} onLogin={() => setLoggedIn(true)} />
  }
  return <Chat host={host} />
}

/* ---------- Login ---------- */
function Login({ connected, onLogin }: { connected: boolean; onLogin: () => void }) {
  const [agentCode, setAgentCode] = useState('')
  const [password, setPassword] = useState('')

  const canSubmit = agentCode.trim().length > 0 && password.trim().length > 0

  function handleLogin() {
    // Demo gate: any non-blank agent code + password logs in.
    if (canSubmit) onLogin()
  }

  // NOTE: a plain <div> + button onClick, NOT a <form>. The embedding iframe's
  // sandbox blocks form submission unless allow-forms is set; using onClick
  // avoids depending on it. (The host also adds allow-forms as a belt-and-
  // suspenders fix.) Enter-to-submit is wired via onKeyDown on the inputs.
  return (
    <div className="cp-login">
      <header className="cp-login__header">
        <span aria-hidden="true" className="cp-login__icon">🏛️</span>
        <h1 className="cp-login__title">RS Living Benefits CoPilot</h1>
      </header>

      <div className="cp-login__card">
        <div className="cp-field">
          <label htmlFor="agentCode">Agent Code</label>
          <input
            id="agentCode"
            type="text"
            placeholder="Enter your agent code"
            value={agentCode}
            onChange={(e) => setAgentCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
        </div>
        <div className="cp-field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
        </div>
        <button type="button" className="cp-login__btn" disabled={!canSubmit} onClick={handleLogin}>
          Login
        </button>
        <p className="cp-login__hint">
          {connected ? 'Connected to Salesforce ✓' : 'Connecting…'}
        </p>
      </div>
    </div>
  )
}

/* ---------- Chat (main view) ---------- */
interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTIONS = [
  'Summarize the cases',
  'Any high priority cases?',
  'How many open cases?',
  'List the files',
]

function Chat({ host }: { host: ReturnType<typeof useCoPilotHost> }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: host.account
        ? `Hi — I'm your CoPilot for ${host.account.name || 'this account'}. Ask me about its cases, files, or details.`
        : "Hi — I'm your CoPilot. Ask me about this account's cases, files, or details.",
    },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [showContext, setShowContext] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  async function ask(question: string) {
    const q = question.trim()
    if (!q || busy) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', content: q }])
    setBusy(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          context: { account: host.account, cases: host.cases, files: host.files },
        }),
      })
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      const data = (await res.json()) as { answer?: string; error?: string }
      const answer = data.error ? `⚠ ${data.error}` : data.answer ?? '(no answer)'
      setMessages((m) => [...m, { role: 'assistant', content: answer }])
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setMessages((m) => [...m, { role: 'assistant', content: `⚠ ${msg}` }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="cp-chat">
      <header className="cp-chat__header">
        <span aria-hidden="true">🏛️</span>
        <h1>RS Living Benefits CoPilot</h1>
        <span className={`cp-pill ${host.connected ? 'cp-pill--ok' : ''}`}>
          {host.connected ? 'Connected' : 'Standalone'}
        </span>
        <button
          type="button"
          className="cp-context-toggle"
          onClick={() => setShowContext((v) => !v)}
        >
          {showContext ? 'Hide context' : 'Show context'}
        </button>
      </header>

      {showContext && (
        <div className="cp-context">
          <AccountPanel account={host.account} recordId={host.recordId} />
          <CasePanel cases={host.cases} />
          <FilePanel files={host.files} orgUrl={host.orgUrl} />
        </div>
      )}

      <div className="cp-messages">
        {messages.map((m, i) => (
          <div key={i} className={`cp-msg cp-msg--${m.role}`}>
            <pre className="cp-msg__bubble">{m.content}</pre>
          </div>
        ))}
        {busy && (
          <div className="cp-msg cp-msg--assistant">
            <div className="cp-msg__bubble cp-msg__bubble--typing">…</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {messages.length <= 1 && (
        <div className="cp-suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="cp-chip" onClick={() => ask(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="cp-composer">
        <input
          type="text"
          placeholder="Ask about this account…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask(input)}
          disabled={busy}
        />
        <button
          type="button"
          className="cp-send"
          onClick={() => ask(input)}
          disabled={busy || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  )
}

/* ---------- Account panel ---------- */
function AccountPanel({
  account,
  recordId,
}: {
  account: { name?: string; id?: string; email?: string } | null
  recordId: string | null
}) {
  return (
    <section className="embed-card embed-card--wide">
      <h2 className="embed-card__title">📇 Account</h2>
      {account ? (
        <dl className="embed-card__grid">
          <dt>Name</dt>
          <dd>{account.name || '—'}</dd>
          <dt>Id</dt>
          <dd>{account.id || recordId || '—'}</dd>
          <dt>Email</dt>
          <dd>{account.email || '—'}</dd>
        </dl>
      ) : (
        <p className="embed-card__subtitle">No account in context.</p>
      )}
    </section>
  )
}

/* ---------- Case panel (with Summarize) ---------- */
function CasePanel({ cases }: { cases: CaseRecord[] }) {
  const [summary, setSummary] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSummarize() {
    setLoading(true)
    setError('')
    setSummary('')
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cases }),
      })
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      const data = (await res.json()) as { summary?: string; error?: string }
      if (data.error) throw new Error(data.error)
      setSummary(data.summary ?? '')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="embed-card embed-card--wide">
      <h2 className="embed-card__title">🗂 Top Cases</h2>
      <p className="embed-card__subtitle">
        {cases.length} recent case{cases.length === 1 ? '' : 's'} for this account.
      </p>
      {cases.length > 0 ? (
        <ul className="embed-caselist">
          {cases.map((c, i) => (
            <li key={c.caseNumber ?? i} className="embed-caseitem">
              <div className="embed-caseitem__head">
                <span className="embed-caseitem__num">{c.caseNumber || 'Case'}</span>
                <span className={`embed-badge ${priorityTone(c.priority)}`}>{c.priority || '—'}</span>
                <span className="embed-badge">{c.status || '—'}</span>
              </div>
              <div className="embed-caseitem__subject">{c.subject || '(no subject)'}</div>
              {c.description ? <div className="embed-caseitem__desc">{c.description}</div> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="embed-card__subtitle">No cases found.</p>
      )}
      <div className="embed-actions">
        <button
          type="button"
          className="embed-btn embed-btn--primary"
          onClick={handleSummarize}
          disabled={cases.length === 0 || loading}
        >
          {loading ? 'Summarizing…' : '✨ Summarize'}
        </button>
      </div>
      {error ? <p className="embed-error">⚠ {error}</p> : null}
      {summary ? <pre className="embed-summary">{summary}</pre> : null}
    </section>
  )
}

/* ---------- File panel ---------- */
function FilePanel({ files, orgUrl }: { files: FileRecord[]; orgUrl: string }) {
  function viewerUrl(docId?: string): string {
    if (!orgUrl || !docId) return '#'
    return `${orgUrl}/lightning/r/ContentDocument/${docId}/view`
  }
  return (
    <section className="embed-card embed-card--wide">
      <h2 className="embed-card__title">📎 Files</h2>
      <p className="embed-card__subtitle">
        {files.length} file{files.length === 1 ? '' : 's'} linked to this account.
      </p>
      {files.length > 0 ? (
        <ul className="embed-filelist">
          {files.map((f, i) => (
            <li key={f.docId ?? i} className="embed-fileitem">
              <span className="embed-fileitem__icon">{fileEmoji(f.fileType)}</span>
              <div className="embed-fileitem__main">
                <a
                  className="embed-fileitem__title"
                  href={viewerUrl(f.docId)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {f.title || '(untitled)'}
                </a>
                <div className="embed-fileitem__meta">
                  <span className="embed-badge">{(f.fileType || 'FILE').toUpperCase()}</span>
                  <span className="embed-fileitem__size">{humanSize(f.sizeBytes)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="embed-card__subtitle">No files linked.</p>
      )}
    </section>
  )
}

/* ---------- helpers ---------- */
function priorityTone(priority?: string): string {
  const p = (priority ?? '').toLowerCase()
  if (/high|urgent|critical/.test(p)) return 'tone-hot'
  if (/medium/.test(p)) return 'tone-warm'
  return 'tone-cold'
}

function fileEmoji(fileType?: string): string {
  const t = (fileType ?? '').toLowerCase()
  if (/pdf/.test(t)) return '📕'
  if (/png|jpg|jpeg|gif|image/.test(t)) return '🖼'
  if (/xls|csv|sheet/.test(t)) return '📊'
  if (/doc|word|txt|rtf/.test(t)) return '📄'
  if (/ppt|slide/.test(t)) return '📽'
  if (/zip|rar|gz/.test(t)) return '🗜'
  return '📎'
}

function humanSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}