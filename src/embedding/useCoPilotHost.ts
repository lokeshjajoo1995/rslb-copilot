/**
 * Reads the aggregated host props for the CoPilot app (uiEmbeddingCoPilot).
 *
 * The host pushes everything as flat scalars: recordId, orgUrl, and three
 * JSON-string payloads (accountJson, casesJson, filesJson). We connect via the
 * standard getViewSDK() pattern and parse the strings back into objects here so
 * the UI components get typed data.
 */
import { useEffect, useState } from 'react'
import { getViewSDK } from '@salesforce/platform-sdk'

export interface AccountContext {
  id?: string
  name?: string
  email?: string
}

export interface CaseRecord {
  caseNumber?: string
  subject?: string
  description?: string
  priority?: string
  status?: string
}

export interface FileRecord {
  docId?: string
  title?: string
  fileType?: string
  sizeBytes?: number
}

interface HostProps {
  recordId?: string
  orgUrl?: string
  accountJson?: string
  casesJson?: string
  filesJson?: string
}

export interface CoPilotHost {
  connected: boolean
  recordId: string | null
  orgUrl: string
  account: AccountContext | null
  cases: CaseRecord[]
  files: FileRecord[]
}

function parse<T>(json: string | undefined, fallback: T): T {
  if (!json) return fallback
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

export function useCoPilotHost(): CoPilotHost {
  const [props, setProps] = useState<HostProps>({})

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let cancelled = false
    getViewSDK().then((sdk) => {
      if (cancelled) return
      const ui = sdk.getUiState?.()
      if (!ui) return
      // eslint-disable-next-line no-console
      console.log('coPilot[guest] INITIAL props=', JSON.stringify(ui.state.props ?? {}))
      setProps(ui.state.props as HostProps)
      unsubscribe = ui.subscribe((next: { props?: HostProps }) => {
        setProps((next.props ?? {}) as HostProps)
      })
    })
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  return {
    connected: Boolean(props.recordId),
    recordId: props.recordId ?? null,
    orgUrl: (props.orgUrl ?? '').replace(/\/+$/, ''),
    account: parse<AccountContext | null>(props.accountJson, null),
    cases: parse<CaseRecord[]>(props.casesJson, []),
    files: parse<FileRecord[]>(props.filesJson, []),
  }
}