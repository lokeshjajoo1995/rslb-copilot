/**
 * Reads the aggregated host props for the CoPilot app (uiEmbeddingCoPilot).
 *
 * The host pushes everything as flat scalars: recordId, orgUrl, and three
 * JSON-string payloads (accountJson, casesJson, filesJson). We connect via the
 * standard getViewSDK() pattern and parse the strings back into objects here so
 * the UI components get typed data.
 */
import { useCallback, useEffect, useState } from 'react'
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

export interface CaseDetail {
  caseNumber?: string
  subject?: string
  description?: string
  priority?: string
  status?: string
  type?: string
  reason?: string
  origin?: string
  owner?: string
  contact?: string
  createdDate?: string
  closedDate?: string
  error?: string
}

interface HostProps {
  recordId?: string
  orgUrl?: string
  accountJson?: string
  casesJson?: string
  filesJson?: string
  contextToken?: number
  caseDetailJson?: string
  caseDetailToken?: number
}

export interface CoPilotHost {
  connected: boolean
  recordId: string | null
  orgUrl: string
  account: AccountContext | null
  cases: CaseRecord[]
  files: FileRecord[]
  /**
   * Monotonic counter bumped by the utility-bar host each time the focused tab
   * resolves to a new context. The record-page host never sends it (undefined),
   * so the chat only shows "context changed" notices in the utility flow.
   */
  contextToken: number | undefined
  /**
   * Richer case fields fetched at runtime, and a monotonic token bumped each
   * time the host answers a case-detail request. The chat watches the token to
   * know a fresh detail arrived (even if two lookups return similar data).
   */
  caseDetail: CaseDetail | null
  caseDetailToken: number | undefined
  /**
   * Ask the host to fetch richer fields for a case. Fires a `casedetail`
   * CustomEvent (host binds oncasedetail); the answer comes back via props →
   * caseDetail on the next subscribe fire. No-op if not connected to a host.
   */
  requestCaseDetail: (caseNumber: string) => Promise<void>
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

  const requestCaseDetail = useCallback(async (caseNumber: string) => {
    const cn = caseNumber.trim()
    if (!cn) return
    const sdk = await getViewSDK()
    sdk.dispatchEvent?.(
      new CustomEvent('casedetail', { detail: { caseNumber: cn }, bubbles: true }),
    )
  }, [])

  return {
    connected: Boolean(props.recordId),
    recordId: props.recordId ?? null,
    orgUrl: (props.orgUrl ?? '').replace(/\/+$/, ''),
    account: parse<AccountContext | null>(props.accountJson, null),
    cases: parse<CaseRecord[]>(props.casesJson, []),
    files: parse<FileRecord[]>(props.filesJson, []),
    contextToken: props.contextToken,
    caseDetail: parse<CaseDetail | null>(props.caseDetailJson, null),
    caseDetailToken: props.caseDetailToken,
    requestCaseDetail,
  }
}