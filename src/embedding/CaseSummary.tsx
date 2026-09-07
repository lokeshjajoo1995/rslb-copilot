/**
 * Case Summary — guest side.
 *
 * The host (uiEmbeddingCaseSummary) pushes the Account's top 3 Cases as
 * props.cases. This guest lists them and offers a single "Summarize" button
 * that POSTs the cases to /api/summarize (a rule-based, no-LLM endpoint) and
 * shows the returned plain-language summary.
 *
 * Read pattern is the same as the other guests: getViewSDK() → getUiState()
 * initial snapshot + subscribe for live updates.
 */
import { useEffect, useState } from 'react'
import { getViewSDK } from '@salesforce/platform-sdk'

interface CaseRecord {
  caseNumber?: string
  subject?: string
  description?: string
  priority?: string
  status?: string
}

interface HostProps {
  recordId?: string
  source?: string
  // Cases arrive as a JSON STRING (flat scalar), not a nested array — nested
  // structures in `props` break the ui-embedding handshake. Parse in-guest.
  casesJson?: string
}

function parseCases(json?: string): CaseRecord[] {
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? (arr as CaseRecord[]) : []
  } catch {
    return []
  }
}

export default function CaseSummary() {
  const [props, setProps] = useState<HostProps>({})
  const [summary, setSummary] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let cancelled = false

    // Decisive diagnostics: the host reported "did not send ready heartbeat"
    // and we saw NO guest logs — so getViewSDK() may be rejecting or hanging.
    // Log boot context + BOTH branches + a hang timer so we can see which.
    let hasHostMeta = false
    try {
      hasHostMeta = new URLSearchParams(window.location.search).has('hostMetaData')
    } catch {
      hasHostMeta = false
    }
    // eslint-disable-next-line no-console
    console.log(
      'caseSummary[guest] BOOT url=', window.location.href,
      '| hostMetaData=', hasHostMeta,
      '| inIframe=', (() => { try { return window.parent !== window } catch { return true } })(),
    )

    const hangTimer = setTimeout(() => {
      if (cancelled) return
      // eslint-disable-next-line no-console
      console.log('caseSummary[guest] HANG: getViewSDK() unsettled after 8s. hostMetaData=', hasHostMeta)
    }, 8000)

    getViewSDK()
      .then((sdk) => {
        clearTimeout(hangTimer)
        if (cancelled) return
        const ui = sdk.getUiState?.()
        if (!ui) {
          // eslint-disable-next-line no-console
          console.log('caseSummary[guest] getViewSDK resolved but getUiState() returned nothing')
          return
        }
        // eslint-disable-next-line no-console
        console.log('caseSummary[guest] INITIAL props=', JSON.stringify(ui.state.props ?? {}))
        setProps(ui.state.props as HostProps)
        unsubscribe = ui.subscribe((next: { props?: HostProps }) => {
          // eslint-disable-next-line no-console
          console.log('caseSummary[guest] SUBSCRIBE props=', JSON.stringify(next.props ?? {}))
          setProps((next.props ?? {}) as HostProps)
        })
      })
      .catch((e: unknown) => {
        clearTimeout(hangTimer)
        if (cancelled) return
        // eslint-disable-next-line no-console
        console.log(
          'caseSummary[guest] getViewSDK() REJECTED:',
          e instanceof Error ? `${e.name}: ${e.message}` : String(e),
        )
      })

    return () => {
      cancelled = true
      clearTimeout(hangTimer)
      unsubscribe?.()
    }
  }, [])

  const cases = parseCases(props.casesJson)
  const connected = Boolean(props.recordId)

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
    <div className="embed-card embed-card--wide">
      <h2 className="embed-card__title">🗂 Top Cases</h2>
      <p className="embed-card__subtitle">
        {connected
          ? `${cases.length} recent case${cases.length === 1 ? '' : 's'} for this account (by last modified).`
          : 'Drop this component on an Account record page to see its cases.'}
      </p>

      {cases.length > 0 ? (
        <ul className="embed-caselist">
          {cases.map((c, i) => (
            <li key={c.caseNumber ?? i} className="embed-caseitem">
              <div className="embed-caseitem__head">
                <span className="embed-caseitem__num">{c.caseNumber || 'Case'}</span>
                <span className={`embed-badge ${priorityTone(c.priority)}`}>
                  {c.priority || '—'}
                </span>
                <span className="embed-badge">{c.status || '—'}</span>
              </div>
              <div className="embed-caseitem__subject">{c.subject || '(no subject)'}</div>
              {c.description ? (
                <div className="embed-caseitem__desc">{c.description}</div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        connected && <p className="embed-card__subtitle">No cases found for this account.</p>
      )}

      <div className="embed-actions">
        <button
          type="button"
          className="embed-btn embed-btn--primary"
          onClick={handleSummarize}
          disabled={!connected || cases.length === 0 || loading}
        >
          {loading ? 'Summarizing…' : '✨ Summarize'}
        </button>
      </div>

      {error ? <p className="embed-error">⚠ {error}</p> : null}
      {summary ? <pre className="embed-summary">{summary}</pre> : null}
    </div>
  )
}

function priorityTone(priority?: string): string {
  const p = (priority ?? '').toLowerCase()
  if (/high|urgent|critical/.test(p)) return 'tone-hot'
  if (/medium/.test(p)) return 'tone-warm'
  return 'tone-cold'
}