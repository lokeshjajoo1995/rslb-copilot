/**
 * File List — guest side.
 *
 * The host (uiEmbeddingFileList) pushes the Account's linked Files as METADATA
 * only: props.filesJson (a JSON string of {docId,title,fileType,sizeBytes}) plus
 * props.orgUrl (the Salesforce origin). We never receive file bytes.
 *
 * Each file links to the Salesforce file viewer
 *   {orgUrl}/lightning/r/ContentDocument/{docId}/view
 * opened in a new tab — so it uses the user's existing Salesforce session and
 * the platform re-checks access. No binary crosses the embedding bridge, which
 * keeps props flat-scalar-only (the rule that keeps the SDK handshake healthy).
 */
import { useEffect, useState } from 'react'
import { getViewSDK } from '@salesforce/platform-sdk'

interface FileRecord {
  docId?: string
  title?: string
  fileType?: string
  sizeBytes?: number
}

interface HostProps {
  recordId?: string
  source?: string
  orgUrl?: string
  // Files arrive as a JSON STRING (flat scalar) — parse in-guest.
  filesJson?: string
}

function parseFiles(json?: string): FileRecord[] {
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? (arr as FileRecord[]) : []
  } catch {
    return []
  }
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

export default function FileList() {
  const [props, setProps] = useState<HostProps>({})

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let cancelled = false
    getViewSDK().then((sdk) => {
      if (cancelled) return
      const ui = sdk.getUiState?.()
      if (!ui) return
      // eslint-disable-next-line no-console
      console.log('fileList[guest] INITIAL props=', JSON.stringify(ui.state.props ?? {}))
      setProps(ui.state.props as HostProps)
      unsubscribe = ui.subscribe((next: { props?: HostProps }) => {
        // eslint-disable-next-line no-console
        console.log('fileList[guest] SUBSCRIBE props=', JSON.stringify(next.props ?? {}))
        setProps((next.props ?? {}) as HostProps)
      })
    })
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  const files = parseFiles(props.filesJson)
  const connected = Boolean(props.recordId)
  const orgUrl = (props.orgUrl ?? '').replace(/\/+$/, '')

  function viewerUrl(docId?: string): string {
    if (!orgUrl || !docId) return '#'
    return `${orgUrl}/lightning/r/ContentDocument/${docId}/view`
  }

  return (
    <div className="embed-card embed-card--wide">
      <h2 className="embed-card__title">📎 Files</h2>
      <p className="embed-card__subtitle">
        {connected
          ? `${files.length} file${files.length === 1 ? '' : 's'} linked to this account.`
          : 'Drop this component on an Account record page to see its files.'}
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
        connected && <p className="embed-card__subtitle">No files linked to this account.</p>
      )}
    </div>
  )
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