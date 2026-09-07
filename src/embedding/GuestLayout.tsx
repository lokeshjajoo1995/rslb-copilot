/**
 * Route layout for the externally-hosted embedding guests — a faithful port of
 * the multiframework-recipes GuestLayout.
 *
 * The FIRST line is load-bearing: importing '@salesforce/platform-sdk/ui-embedding'
 * for its side effect runs bootstrapSession() at module load, which registers the
 * handshake listener that answers <lightning-ui-embedding>'s postMessage. Without
 * it getViewSDK() awaits a session nothing ever bootstrapped and hangs forever.
 * This MUST run before any child recipe calls getViewSDK() — putting it at the top
 * of the layout that wraps every guest route guarantees that ordering.
 */
import '@salesforce/platform-sdk/ui-embedding'

import { useEffect } from 'react'
import { Outlet } from 'react-router'

export default function GuestLayout() {
  useEffect(() => {
    // Chromeless: transparent bg, no margins — the guest is an iframe body.
    document.documentElement.classList.add('embedding-guest')
    return () => {
      document.documentElement.classList.remove('embedding-guest')
    }
  }, [])

  return <Outlet />
}