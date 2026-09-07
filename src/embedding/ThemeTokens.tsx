/**
 * Theme Tokens — guest side. Faithful port of the recipe
 * (react-recipes/.../recipes/embedding/ThemeTokens.tsx), minus shadcn UI.
 *
 * The host (uiEmbeddingThemeTokens) sends a theme NAME ('light' | 'dark' |
 * 'salesforce') as props.theme — no token values cross the wire. The guest
 * owns what each name looks like: we set that name as the class on the card's
 * root, and scoped CSS variables (see embedding.css / theme-tokens-salesforce)
 * cascade to the card chrome. Account fields ride along so the demo has data.
 */
import { useEffect, useState } from 'react'
import { getViewSDK } from '@salesforce/platform-sdk'
import './theme-tokens-salesforce.css'

type Theme = 'light' | 'dark' | 'salesforce'

interface Payload {
  theme?: Theme
  recordId?: string
  name?: string | null
  industry?: string | null
  type?: string | null
  website?: string | null
}

export default function ThemeTokens() {
  const [payload, setPayload] = useState<Payload>({})

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let cancelled = false
    getViewSDK().then((sdk) => {
      if (cancelled) return
      const ui = sdk.getUiState?.()
      if (!ui) return
      setPayload(ui.state.props as Payload)
      unsubscribe = ui.subscribe((next: { props?: Payload }) =>
        setPayload((next.props ?? {}) as Payload),
      )
    })
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  const { theme = 'light', name, industry, type, website } = payload
  const connected = Boolean(payload.recordId)

  // The theme name IS the class; the CSS variables it scopes cascade to the
  // whole card. `embed-theme` marks the themed root so scoped vars apply.
  return (
    <div className={`embed-theme theme-${theme}`}>
      <div className="embed-card">
        <h2 className="embed-card__title">{name ?? 'Account'}</h2>
        <p className="embed-card__subtitle">
          {connected ? `Guest is in ${theme} mode — host sent it.` : 'Waiting for host…'}
        </p>
        <dl className="embed-card__grid">
          <dt>🏢 Industry</dt>
          <dd>{industry ? <span className="embed-badge">{industry}</span> : '—'}</dd>
          <dt>🏷 Type</dt>
          <dd>{type ? <span className="embed-badge">{type}</span> : '—'}</dd>
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
        </dl>
      </div>
    </div>
  )
}

function normalizeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}