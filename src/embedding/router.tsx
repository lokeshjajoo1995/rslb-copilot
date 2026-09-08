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
import ReadHostData from './ReadHostData.tsx'
import SendToHost from './SendToHost.tsx'
import ThemeTokens from './ThemeTokens.tsx'
import AutoResize from './AutoResize.tsx'
import CaseSummary from './CaseSummary.tsx'
import FileList from './FileList.tsx'
import './embedding.css'

const router = createBrowserRouter([
  {
    // Pathless layout → sits outside any app chrome; just bootstraps the SDK.
    element: <GuestLayout />,
    children: [
      // The uiEmbeddingBasicRender AND uiEmbeddingReadyState LWC hosts both
      // point their src at .../embedding/basic-render, so one route serves both.
      { path: '/embedding/basic-render', element: <BasicRender /> },
      // Live-updating read (uiEmbeddingReadHostData host).
      { path: '/embedding/read-host-data', element: <ReadHostData /> },
      // Guest→host scoring events (uiEmbeddingSendToHost host, onscore handler).
      { path: '/embedding/send-to-host', element: <SendToHost /> },
      // Host sends a theme NAME; guest flips CSS vars (uiEmbeddingThemeTokens).
      { path: '/embedding/theme-tokens', element: <ThemeTokens /> },
      // Content-driven iframe height via the bundled EmbeddingResizer
      // (uiEmbeddingAutoResize host). No SDK call needed.
      { path: '/embedding/auto-resize', element: <AutoResize /> },
      // Top 3 Account cases + a "Summarize" button (uiEmbeddingCaseSummary
      // host → props.cases; POSTs to /api/summarize).
      { path: '/embedding/case-summary', element: <CaseSummary /> },
      // Account files (metadata only) linking to the SF viewer
      // (uiEmbeddingFileList host → props.filesJson + orgUrl).
      { path: '/embedding/file-list', element: <FileList /> },
    ],
  },
])

export function EmbeddingRouter() {
  return <RouterProvider router={router} />
}