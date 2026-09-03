import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Initialize the MFE bridge as a side effect so the guest connects to the
// Salesforce <lwc-shell> when embedded (harmless when run standalone).
import '@salesforce/experimental-mfe-bridge'
import App from './App.tsx'

// When embedded (in an iframe, e.g. the MFE shell or /mfe route), mark the
// document so CSS can switch from full-viewport (100vh) to a bounded, content-
// sized layout that the shell's auto-resize can measure.
const embedded =
  window.self !== window.top ||
  window.location.pathname.replace(/\/+$/, '') === '/mfe'
if (embedded) document.documentElement.classList.add('mfe-embedded')

// Both /mfe (embedded in Salesforce) and / (standalone) render the real app —
// the RS Living Benefits CoPilot login → chat → policies experience.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)