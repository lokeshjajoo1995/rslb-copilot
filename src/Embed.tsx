import { useViewSdkHost } from "./useViewSdkHost";
import "./App.css";

/**
 * Guest view for the GA <lightning-ui-embedding> host (rsCoPilotUiEmbedding).
 *
 * This is the ui-embedding counterpart to the lwc-shell guest (Mfe/App). It
 * reads host context via the Platform SDK (useViewSdkHost) and shows the same
 * "Account in context" section — proving the GA data-passing path end to end.
 *
 * Kept as a separate route (/embed) so the lwc-shell POC (/mfe) and this one
 * can run side by side for comparison.
 */
export default function Embed() {
	const { connected, account } = useViewSdkHost();

	return (
		<div className="page">
			<header className="header">
				<span className="header-icon" aria-hidden="true">
					🏛️
				</span>
				<h1 className="header-title">RS Living Benefits CoPilot</h1>
			</header>

			<div style={{ padding: "0 24px 24px" }}>
				<p className="assistant-subtitle" style={{ margin: "8px 0 16px" }}>
					GA embedding via <code>&lt;lightning-ui-embedding&gt;</code>. Host
					context arrives through the Platform SDK (
					<code>viewSDK.getUiState()</code>) — no lwc-shell, no bridge patch.
				</p>

				<section className="status-pill-row" style={{ marginBottom: 16 }}>
					<span className={`status-pill ${connected ? "online" : ""}`}>
						{connected
							? "🟢 UI Embedding connected"
							: "🟡 Not connected (standalone)"}
					</span>
				</section>

				{account ? (
					<section className="account-panel">
						<h3 className="account-panel-title">📇 Account in context</h3>
						<dl className="account-fields">
							<div>
								<dt>Name</dt>
								<dd>{account.name || "—"}</dd>
							</div>
							<div>
								<dt>Id</dt>
								<dd className="mono">{account.id}</dd>
							</div>
							<div>
								<dt>Email</dt>
								<dd>{account.email || "—"}</dd>
							</div>
						</dl>
					</section>
				) : (
					<p className="assistant-subtitle">
						Drop this component on an <strong>Account record page</strong> to
						see the account's Name, Id, and Email pushed from the host.
					</p>
				)}
			</div>
		</div>
	);
}