import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import Embed from './Embed.tsx'

const path = window.location.pathname.replace(/\/+$/, '')

// Initialize the lwc-shell MFE bridge ONLY for the lwc-shell routes (/mfe, /).
// The GA /embed route uses @salesforce/platform-sdk instead, so we must NOT
// boot the old bridge there — it floods the console and races the SDK.
if (path !== '/embed') {
  void import('@salesforce/experimental-mfe-bridge')
}

// When embedded (in an iframe, e.g. the MFE shell or /mfe route), mark the
// document so CSS can switch from full-viewport (100vh) to a bounded, content-
// sized layout that the shell's auto-resize can measure.
const embedded =
  window.self !== window.top || path === '/mfe' || path === '/embed'
if (embedded) document.documentElement.classList.add('mfe-embedded')

// Route:
//   /embed → GA <lightning-ui-embedding> guest (Platform SDK)
//   /mfe and / → the dev-preview lwc-shell app (login → chat → policies)
const root = path === '/embed' ? <Embed /> : <App />

createRoot(document.getElementById('root')!).render(
  <StrictMode>{root}</StrictMode>,
)