import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

const path = window.location.pathname.replace(/\/+$/, '')
const rootEl = createRoot(document.getElementById('root')!)

// Route dispatch:
//   /embedding/*  → GA <lightning-ui-embedding> guests, faithful recipe port
//                   (SDK 12 + react-router + GuestLayout bootstrap). This is the
//                   path we host on Vercel for the uiEmbedding* LWC hosts.
//   /embed        → the older single-page ui-embedding experiment (kept for now)
//   /mfe and /    → the dev-preview lwc-shell app (login → chat → policies)
//
// The lwc-shell bridge (@salesforce/experimental-mfe-bridge) must boot ONLY for
// the lwc-shell routes — never on the Platform-SDK embedding routes, where it
// would race the SDK handshake. So we gate every legacy-bridge-bearing import
// behind the route check and lazy-load them.
if (path.startsWith('/embedding')) {
  // GA embedding guests. react-router matches /embedding/<recipe> under the
  // pathless GuestLayout that bootstraps the Platform SDK session.
  void import('./embedding/router.tsx').then(({ EmbeddingRouter }) => {
    rootEl.render(
      <StrictMode>
        <EmbeddingRouter />
      </StrictMode>,
    )
  })
} else {
  // lwc-shell routes: boot the legacy bridge, then render.
  void import('@salesforce/experimental-mfe-bridge')
  const embedded = window.self !== window.top || path === '/mfe' || path === '/embed'
  if (embedded) document.documentElement.classList.add('mfe-embedded')

  if (path === '/embed') {
    void import('./Embed.tsx').then(({ default: Embed }) => {
      rootEl.render(
        <StrictMode>
          <Embed />
        </StrictMode>,
      )
    })
  } else {
    void import('./App.tsx').then(({ default: App }) => {
      rootEl.render(
        <StrictMode>
          <App />
        </StrictMode>,
      )
    })
  }
}