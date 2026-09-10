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
import {
  useCoPilotHost,
  type CaseRecord,
  type FileRecord,
  type CaseDetail,
} from './useCoPilotHost'
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
  role: 'user' | 'assistant' | 'system'
  content: string
}

const SUGGESTIONS = [
  'Detailed summary',
  'Summarize the cases',
  'Any high priority cases?',
  'List the files',
]

// "more details" intent — only matched when the phrasing signals wanting MORE
// than the summary we already have (details/full/tell me more/who owns…).
const DETAIL_INTENT =
  /\b(more|detail|details|full|elaborate|expand|who\s+owns|owner|opened|created|closed|origin|reason)\b/i

// "detailed summary" intent — a holistic account briefing (account + cases +
// files), served by the /api/summary endpoint. Matched when the user asks for a
// detailed/full/overall summary or briefing of the account. Checked BEFORE the
// per-case detail intent so "detailed summary" doesn't get captured as a case
// lookup (both share the word "detail").
const SUMMARY_INTENT =
  /\b(detailed|detail|full|overall|complete|deep)\b.*\b(summary|overview|briefing|brief|rundown|picture)\b|\b(summari[sz]e|brief)\b.*\b(account|everything|all)\b/i

/**
 * Given a chat question, decide if it's asking for deeper detail on a specific
 * case and, if so, which case (by number or subject) from the ones in context.
 * Returns the matched CaseRecord's caseNumber, or null if no clear match.
 */
function resolveCaseForDetail(question: string, cases: CaseRecord[]): string | null {
  if (!DETAIL_INTENT.test(question) || cases.length === 0) return null
  const q = question.toLowerCase()

  // 1) Explicit case number (with or without leading zeros / a '#').
  const numMatch = q.match(/#?\s*0*([0-9]{3,})/)
  if (numMatch) {
    const typed = numMatch[1]
    const hit = cases.find((c) => {
      const cn = (c.caseNumber ?? '').replace(/^0+/, '')
      return cn === typed || (c.caseNumber ?? '') === numMatch[0].replace(/[^0-9]/g, '')
    })
    if (hit?.caseNumber) return hit.caseNumber
  }

  // 2) Subject keyword overlap — pick the case whose subject shares the most
  //    non-trivial words with the question.
  let best: { cn: string; score: number } | null = null
  for (const c of cases) {
    const subj = (c.subject ?? '').toLowerCase()
    if (!subj || !c.caseNumber) continue
    const words = subj.split(/\W+/).filter((w) => w.length >= 4)
    const score = words.filter((w) => q.includes(w)).length
    if (score > 0 && (!best || score > best.score)) best = { cn: c.caseNumber, score }
  }
  return best?.cn ?? null
}

function formatCaseDetail(d: CaseDetail): string {
  if (d.error) return `⚠ ${d.error}`
  const lines: string[] = []
  lines.push(`Case ${d.caseNumber || ''} — ${d.subject || '(no subject)'}`.trim())
  const kv: [string, string | undefined][] = [
    ['Status', d.status],
    ['Priority', d.priority],
    ['Type', d.type],
    ['Reason', d.reason],
    ['Origin', d.origin],
    ['Owner', d.owner],
    ['Contact', d.contact],
    ['Opened', d.createdDate],
    ['Closed', d.closedDate],
  ]
  for (const [k, v] of kv) if (v) lines.push(`${k}: ${v}`)
  if (d.description) lines.push('', `Description:\n${d.description}`)
  return lines.join('\n')
}

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
  const lastTokenRef = useRef<number | undefined>(host.contextToken)
  // Track the case-detail token so we render each host answer exactly once.
  const lastDetailTokenRef = useRef<number | undefined>(host.caseDetailToken)
  // True while we've asked the host for a detail and are awaiting the push.
  const awaitingDetailRef = useRef(false)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  // Utility-bar flow: when the focused tab resolves to a NEW context, the host
  // bumps contextToken. Keep the conversation, just drop in a system line so the
  // agent knows subsequent answers are about the new account. The record-page
  // host never sends contextToken (undefined), so this stays inert there.
  useEffect(() => {
    const token = host.contextToken
    if (token === undefined) return
    if (lastTokenRef.current === undefined) {
      lastTokenRef.current = token
      return
    }
    if (token === lastTokenRef.current) return
    lastTokenRef.current = token
    const label = host.account?.name
      ? `Context changed to ${host.account.name}`
      : 'Context cleared — no account in focus'
    setMessages((m) => [...m, { role: 'system', content: label }])
  }, [host.contextToken, host.account?.name])

  // Runtime case-detail answers: when the host bumps caseDetailToken, a fresh
  // detail (or error) has arrived. Render it as an assistant message — but only
  // if WE asked for it (awaitingDetailRef), and only once per token.
  useEffect(() => {
    const token = host.caseDetailToken
    if (token === undefined) return
    if (lastDetailTokenRef.current === undefined) {
      lastDetailTokenRef.current = token
      return
    }
    if (token === lastDetailTokenRef.current) return
    lastDetailTokenRef.current = token
    if (!awaitingDetailRef.current) return
    awaitingDetailRef.current = false
    setBusy(false)
    const content = host.caseDetail
      ? formatCaseDetail(host.caseDetail)
      : '⚠ No details returned for that case.'
    setMessages((m) => [...m, { role: 'assistant', content }])
  }, [host.caseDetailToken, host.caseDetail])

  async function ask(question: string) {
    const q = question.trim()
    if (!q || busy) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', content: q }])
    setBusy(true)

    // "detailed summary" intent → holistic account briefing from /api/summary.
    // Checked FIRST so it isn't captured by the per-case detail intent below
    // (both share the word "detail"). Guest fetches the endpoint directly, same
    // as /api/chat — the whole account/cases/files context is sent along.
    if (SUMMARY_INTENT.test(q)) {
      try {
        const res = await fetch('/api/summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            account: host.account,
            cases: host.cases,
            files: host.files,
          }),
        })
        if (!res.ok) throw new Error(`Request failed (${res.status})`)
        const data = (await res.json()) as { summary?: string; error?: string }
        const content = data.error ? `⚠ ${data.error}` : data.summary ?? '(no summary)'
        setMessages((m) => [...m, { role: 'assistant', content }])
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setMessages((m) => [...m, { role: 'assistant', content: `⚠ ${msg}` }])
      } finally {
        setBusy(false)
      }
      return
    }

    // Runtime detail intent → round-trip through the host (Salesforce), not the
    // Vercel /api/chat. The answer arrives via the caseDetailToken effect above.
    const caseNumber = resolveCaseForDetail(q, host.cases)
    if (caseNumber) {
      if (!host.connected) {
        setMessages((m) => [
          ...m,
          { role: 'assistant', content: '⚠ Not connected to Salesforce — can’t pull live case details here.' },
        ])
        setBusy(false)
        return
      }
      awaitingDetailRef.current = true
      try {
        await host.requestCaseDetail(caseNumber)
        // busy stays true until the host pushes the detail (token effect clears it).
        // Safety net: if no answer lands in 12s, stop waiting and surface it.
        window.setTimeout(() => {
          if (!awaitingDetailRef.current) return
          awaitingDetailRef.current = false
          setBusy(false)
          setMessages((m) => [
            ...m,
            { role: 'assistant', content: '⚠ Timed out fetching that case’s details.' },
          ])
        }, 12000)
      } catch (e) {
        awaitingDetailRef.current = false
        const msg = e instanceof Error ? e.message : String(e)
        setMessages((m) => [...m, { role: 'assistant', content: `⚠ ${msg}` }])
        setBusy(false)
      }
      return
    }

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
        {messages.map((m, i) =>
          m.role === 'system' ? (
            <div key={i} className="cp-msg cp-msg--system">
              <span className="cp-msg__notice">🔄 {m.content}</span>
            </div>
          ) : (
            <div key={i} className={`cp-msg cp-msg--${m.role}`}>
              <pre className="cp-msg__bubble">{m.content}</pre>
            </div>
          )
        )}
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