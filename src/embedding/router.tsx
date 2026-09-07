/**
 * Router for the GA <lightning-ui-embedding> guests. Mirrors the recipe's
 * routes.tsx: a PATHLESS GuestLayout route (bootstraps the Platform SDK) whose
 * children are the per-recipe guest routes reached at /embedding/<recipe>.
 *
 * Isolated in its own module (lazy-loaded from main.tsx) so importing
 * GuestLayout — which side-effect-imports @salesforce/platform-sdk/ui-embedding
 * to start the session — happens ONLY on the embedding routes, never on the
 * lwc-shell (/mfe) route.
 */
import { createBrowserRouter, RouterProvider } from 'react-router'
import GuestLayout from './GuestLayout.tsx'
import BasicRender from './BasicRender.tsx'
import './embedding.css'

const router = createBrowserRouter([
  {
    // Pathless layout → sits outside any app chrome; just bootstraps the SDK.
    element: <GuestLayout />,
    children: [
      // The uiEmbeddingBasicRender AND uiEmbeddingReadyState LWC hosts both
      // point their src at .../embedding/basic-render, so one route serves both.
      { path: '/embedding/basic-render', element: <BasicRender /> },
    ],
  },
])

export function EmbeddingRouter() {
  return <RouterProvider router={router} />
}