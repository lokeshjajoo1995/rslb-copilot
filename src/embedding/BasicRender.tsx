/**
 * Basic Render — guest side. Faithful port of the working recipe
 * (react-recipes/.../recipes/embedding/BasicRender.tsx), minus the shadcn UI.
 *
 * Reads Account props (recordId, name, industry, type, website) that the LWC
 * host (uiEmbeddingBasicRender / uiEmbeddingReadyState) pushes through the
 * Platform SDK ui-state channel, and renders them as a simple card.
 *
 *   getViewSDK()                  -> async, resolves once the session bootstrapped
 *                                    by GuestLayout's side-effect import is ready
 *   sdk.getUiState()              -> { state: { props }, subscribe }
 *   state.props                   -> the object the host bound to `props`
 *   subscribe(next => next.props) -> fires on every host push
 */
import { useEffect, useState } from 'react'
import { getViewSDK } from '@salesforce/platform-sdk'

interface AccountProps {
  recordId?: string
  name?: string | null
  industry?: string | null
  type?: string | null
  website?: string | null
}

export default function BasicRender() {
  const [account, setAccount] = useState<AccountProps>({})

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let cancelled = false
    getViewSDK().then((sdk) => {
      if (cancelled) return
      const ui = sdk.getUiState?.()
      if (!ui) return
      setAccount(ui.state.props as AccountProps)
      unsubscribe = ui.subscribe((next: { props?: AccountProps }) =>
        setAccount((next.props ?? {}) as AccountProps),
      )
    })
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  const { name, industry, type, website } = account
  const connected = Boolean(account.recordId)

  return (
    <div className="embed-card">
      <h2 className="embed-card__title">{name ?? 'Account'}</h2>
      <p className="embed-card__subtitle">
        {connected ? (
          <>
            Live from{' '}
            <a href={window.location.href} target="_blank" rel="noopener noreferrer">
              <code>
                {window.location.origin}
                {window.location.pathname}
              </code>
            </a>
          </>
        ) : (
          'Waiting for host…'
        )}
      </p>
      <dl className="embed-card__grid">
        <dt>Industry</dt>
        <dd>{industry ?? '—'}</dd>
        <dt>Type</dt>
        <dd>{type ?? '—'}</dd>
        <dt>Website</dt>
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
  )
}

function normalizeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}