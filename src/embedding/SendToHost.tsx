/**
 * Send To Host — guest side. Faithful port of the recipe
 * (react-recipes/.../recipes/embedding/SendToHost.tsx), minus shadcn UI.
 *
 * A 3×3 scoring matrix over engagement (rows) × fit (cols). Each cell maps to a
 * (Rating, Type) pair. Clicking fires a `score` CustomEvent via
 * sdk.dispatchEvent(); the host LWC (uiEmbeddingSendToHost) reads rating/type
 * off event.detail and writes them back with updateRecord — which then streams
 * back down to the Read-host-data guest as a live update.
 *
 * NOTE: the CustomEvent name must match the host's on<name> handler. The host
 * binds `onscore`, so the event type is 'score' (all lowercase).
 */
import { Fragment, useEffect, useState } from 'react'
import { getViewSDK } from '@salesforce/platform-sdk'

type Engagement = 'low' | 'medium' | 'high'
type Fit = 'poor' | 'partial' | 'strong'
type Rating = 'Hot' | 'Warm' | 'Cold'

interface Cell {
  rating: Rating
  type: string
}

interface HostProps {
  recordId?: string
  rating?: Rating | null
  type?: string | null
}

// Rows: engagement (high → low). Cols: fit (poor → strong).
const MATRIX: Record<Engagement, Record<Fit, Cell>> = {
  high: {
    poor: { rating: 'Warm', type: 'Prospect' },
    partial: { rating: 'Warm', type: 'Customer - Channel' },
    strong: { rating: 'Hot', type: 'Customer - Direct' },
  },
  medium: {
    poor: { rating: 'Cold', type: 'Prospect' },
    partial: { rating: 'Warm', type: 'Customer - Channel' },
    strong: { rating: 'Warm', type: 'Customer - Direct' },
  },
  low: {
    poor: { rating: 'Cold', type: 'Prospect' },
    partial: { rating: 'Cold', type: 'Customer - Channel' },
    strong: { rating: 'Warm', type: 'Technology Partner' },
  },
}

const ENGAGEMENTS: Engagement[] = ['high', 'medium', 'low']
const FITS: Fit[] = ['poor', 'partial', 'strong']

const RATING_TONE: Record<Rating, string> = {
  Hot: 'tone-hot',
  Warm: 'tone-warm',
  Cold: 'tone-cold',
}

export default function SendToHost() {
  const [host, setHost] = useState<HostProps>({})

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let cancelled = false
    getViewSDK().then((sdk) => {
      if (cancelled) return
      const ui = sdk.getUiState?.()
      if (!ui) return
      setHost(ui.state.props as HostProps)
      unsubscribe = ui.subscribe((next: { props?: HostProps }) =>
        setHost((next.props ?? {}) as HostProps),
      )
    })
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  const connected = Boolean(host.recordId)

  async function handleClick(engagement: Engagement, fit: Fit) {
    if (!connected) return
    const { rating, type } = MATRIX[engagement][fit]
    const sdk = await getViewSDK()
    sdk.dispatchEvent?.(
      new CustomEvent('score', {
        detail: { rating, type },
        bubbles: true,
      }),
    )
  }

  return (
    <div className="embed-card embed-card--wide">
      <h2 className="embed-card__title">✨ Score this Account</h2>
      <p className="embed-card__subtitle">
        {connected
          ? 'Pick a cell to update Rating and Type.'
          : 'Drop this component on an Account record page to enable scoring.'}
      </p>

      {connected && (
        <div className="embed-current">
          <span>Current:</span>
          <span className="embed-badge">{host.rating ?? 'Unrated'}</span>
          <span className="embed-badge">{host.type ?? 'No Type'}</span>
        </div>
      )}

      <div className="embed-matrix">
        <div className="embed-matrix__corner" />
        {FITS.map((fit) => (
          <div key={fit} className="embed-matrix__colhead">
            {fit} fit
          </div>
        ))}

        {ENGAGEMENTS.map((engagement) => (
          <Fragment key={engagement}>
            <div className="embed-matrix__rowhead">{engagement}</div>
            {FITS.map((fit) => {
              const cell = MATRIX[engagement][fit]
              return (
                <button
                  key={fit}
                  type="button"
                  disabled={!connected}
                  onClick={() => handleClick(engagement, fit)}
                  className={`embed-matrix__cell ${RATING_TONE[cell.rating]}`}
                >
                  <span className="embed-matrix__cell-rating">{cell.rating}</span>
                  <span className="embed-matrix__cell-type">{cell.type}</span>
                </button>
              )
            })}
          </Fragment>
        ))}
      </div>
    </div>
  )
}