import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Embed is imported STATICALLY (not lazily): the Platform SDK handshake is
// timing-sensitive — getViewSDK() must fire as early as possible after
// <lightning-ui-embedding> mounts the iframe, or the handshake window is missed
// and it hangs. A dynamic import would delay that call by a chunk fetch. Embed's
// tree pulls ONLY @salesforce/platform-sdk (never App.tsx / the legacy
// experimental-mfe-bridge), so importing it here does not reintroduce the
// double-bridge race.
import Embed from './Embed.tsx'

const path = window.location.pathname.replace(/\/+$/, '')

// When embedded (in an iframe, e.g. the MFE shell or /mfe route), mark the
// document so CSS can switch from full-viewport (100vh) to a bounded, content-
// sized layout that the shell's auto-resize can measure.
const embedded =
  window.self !== window.top || path === '/mfe' || path === '/embed'
if (embedded) document.documentElement.classList.add('mfe-embedded')

const rootEl = createRoot(document.getElementById('root')!)

if (path === '/embed') {
  // GA <lightning-ui-embedding> guest (Platform SDK). Rendered synchronously so
  // getViewSDK() fires immediately. App.tsx's tree (and its legacy bridge) is
  // never imported on this route → no second postMessage handshake to race.
  rootEl.render(
    <StrictMode>
      <Embed />
    </StrictMode>,
  )
} else {
  // The dev-preview lwc-shell app (login → chat → policies). Lazy-load it and
  // its bridge only for the lwc-shell routes (/mfe, /).
  void import('@salesforce/experimental-mfe-bridge')
  void import('./App.tsx').then(({ default: App }) => {
    rootEl.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
}