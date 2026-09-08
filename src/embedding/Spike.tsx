/**
 * SPIKE — throwaway guest (route /embedding/spike). Delete after validating.
 *
 * Displays props pushed by uiEmbeddingSpike and logs every subscribe fire.
 * We watch:
 *   - `tick` climbing        → post-connect props updates DO reach the guest (Risk A)
 *   - focusedRecordId/Object → workspace API works from the utility bar (Risk B)
 */
import { useEffect, useState } from 'react'
import { getViewSDK } from '@salesforce/platform-sdk'

interface SpikeProps {
  tick?: number
  focusedRecordId?: string
  focusedObject?: string
  focusedUrl?: string
}

export default function Spike() {
  const [props, setProps] = useState<SpikeProps>({})
  const [updates, setUpdates] = useState(0)

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let cancelled = false
    getViewSDK().then((sdk) => {
      if (cancelled) return
      const ui = sdk.getUiState?.()
      if (!ui) return
      // eslint-disable-next-line no-console
      console.log('spike[guest] INITIAL props=', JSON.stringify(ui.state.props ?? {}))
      setProps(ui.state.props as SpikeProps)
      unsubscribe = ui.subscribe((next: { props?: SpikeProps }) => {
        // eslint-disable-next-line no-console
        console.log('spike[guest] SUBSCRIBE props=', JSON.stringify(next.props ?? {}))
        setProps((next.props ?? {}) as SpikeProps)
        setUpdates((n) => n + 1)
      })
    })
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  return (
    <div className="embed-card embed-card--wide">
      <h2 className="embed-card__title">🧪 Spike</h2>
      <p className="embed-card__subtitle">
        subscribe fires received: <strong>{updates}</strong>
      </p>
      <dl className="embed-card__grid">
        <dt>tick (host counter)</dt>
        <dd><strong>{props.tick ?? '—'}</strong></dd>
        <dt>focused recordId</dt>
        <dd>{props.focusedRecordId || '—'}</dd>
        <dt>focused object</dt>
        <dd>{props.focusedObject || '—'}</dd>
        <dt>focused url</dt>
        <dd style={{ wordBreak: 'break-all', fontSize: 12 }}>{props.focusedUrl || '—'}</dd>
      </dl>
      <p className="embed-card__subtitle" style={{ marginTop: 12 }}>
        ✅ Risk A passes if <em>tick</em> and <em>subscribe fires</em> keep climbing.<br />
        ✅ Risk B passes if <em>focused recordId/object</em> change when you switch tabs.
      </p>
    </div>
  )
}