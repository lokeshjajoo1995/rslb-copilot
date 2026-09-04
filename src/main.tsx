import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

const path = window.location.pathname.replace(/\/+$/, '')

// When embedded (in an iframe, e.g. the MFE shell or /mfe route), mark the
// document so CSS can switch from full-viewport (100vh) to a bounded, content-
// sized layout that the shell's auto-resize can measure.
const embedded =
  window.self !== window.top || path === '/mfe' || path === '/embed'
if (embedded) document.documentElement.classList.add('mfe-embedded')

const rootEl = createRoot(document.getElementById('root')!)

// IMPORTANT: route with DYNAMIC imports so each route pulls ONLY its own code.
//   /embed → GA <lightning-ui-embedding> guest (Platform SDK) — must NEVER load
//            App.tsx's tree, which side-effect-imports the legacy
//            @salesforce/experimental-mfe-bridge. That bridge boots a second
//            postMessage handshake that RACES getViewSDK() (the cause of the
//            intermittent "init: calling getViewSDK()…" hang).
//   /mfe, / → the dev-preview lwc-shell app (login → chat → policies), which
//            side-effect-imports the experimental bridge on load.
if (path === '/embed') {
  void import('./Embed.tsx').then(({ default: Embed }) => {
    rootEl.render(
      <StrictMode>
        <Embed />
      </StrictMode>,
    )
  })
} else {
  // Boot the lwc-shell bridge only for the lwc-shell routes.
  void import('@salesforce/experimental-mfe-bridge')
  void import('./App.tsx').then(({ default: App }) => {
    rootEl.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
}