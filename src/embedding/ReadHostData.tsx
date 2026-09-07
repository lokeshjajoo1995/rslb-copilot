/**
 * Read Host Data — guest side. Faithful port of the recipe
 * (react-recipes/.../recipes/embedding/ReadHostData.tsx), minus shadcn UI.
 *
 * Subscribes to live Account fields the host pushes. The LWC
 * (uiEmbeddingReadHostData) wires getRecord and rebuilds `account` with a fresh
 * object identity on every change; that flushes ui-state-changed, and our
 * subscribe callback fires with the new values — so edits made in Salesforce
 * (or via the Send-to-host recipe) show up here live, incrementing the counter.
 */
import { useEffect, useState } from 'react'
import { getViewSDK } from '@salesforce/platform-sdk'

type Rating = 'Hot' | 'Warm' | 'Cold'

interface AccountProps {
  recordId?: string
  name?: string | null
  rating?: Rating | null
  type?: string | null
  industry?: string | null
  website?: string | null
  phone?: string | null
}

const RATING_TONE: Record<Rating, string> = {
  Hot: 'tone-hot',
  Warm: 'tone-warm',
  Cold: 'tone-cold',
}

export default function ReadHostData() {
  const [account, setAccount] = useState<AccountProps>({})
  const [updateCount, setUpdateCount] = useState(0)

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let cancelled = false
    getViewSDK().then((sdk) => {
      if (cancelled) return
      const ui = sdk.getUiState?.()
      if (!ui) return
      setAccount(ui.state.props as AccountProps)
      unsubscribe = ui.subscribe((next: { props?: AccountProps }) => {
        setAccount((next.props ?? {}) as AccountProps)
        setUpdateCount((c) => c + 1)
      })
    })
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  const { name, rating, type, industry, website, phone } = account
  const connected = Boolean(account.recordId)

  return (
    <div className="embed-card" key={updateCount}>
      <h2 className="embed-card__title">👤 {name ?? 'Account'}</h2>
      <p className="embed-card__subtitle">
        {connected
          ? `Live from the host — ${updateCount} update${updateCount === 1 ? '' : 's'} received`
          : 'Drop this component on an Account record page to see live data.'}
      </p>
      <dl className="embed-card__grid">
        <dt>⭐ Rating</dt>
        <dd>
          {rating ? (
            <span className={`embed-badge ${RATING_TONE[rating]}`}>{rating}</span>
          ) : (
            '—'
          )}
        </dd>
        <dt>🏷 Type</dt>
        <dd>{type ? <span className="embed-badge">{type}</span> : '—'}</dd>
        <dt>🏢 Industry</dt>
        <dd>{industry ?? '—'}</dd>
        <dt>🌐 Website</dt>
        <dd>
          {website ? (
            <a href={normalizeUrl(website)} target="_blank" rel="noopener noreferrer">
              {website}
            </a>
          ) : (
            '—'
          )}
        </dd>
        <dt>📞 Phone</dt>
        <dd>{phone ?? '—'}</dd>
      </dl>
    </div>
  )
}

function normalizeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}