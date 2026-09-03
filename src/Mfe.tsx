import { useEffect, useState } from "react";
import bridge from "@salesforce/experimental-mfe-bridge";

/**
 * MFE guest view — runs inside the Salesforce <lwc-shell> iframe.
 *
 * Uses the MFE Bridge singleton to:
 *  - read host data pushed via shell.updateData()  -> bridge.getData()
 *  - query org data directly through the bridge     -> bridge.graphql()
 *  - fire an event back to the host wrapper LWC      -> bridge.dispatchEvent()
 */
interface HostData {
	recordId?: string;
	source?: string;
	[k: string]: unknown;
}

export default function Mfe() {
	const [connected, setConnected] = useState<boolean>(false);
	const [data, setData] = useState<HostData>({});
	const [accounts, setAccounts] = useState<string[]>([]);
	const [gqlError, setGqlError] = useState<string | null>(null);
	const [bridgeError, setBridgeError] = useState<string | null>(null);

	useEffect(() => {
		// Initial snapshot.
		setConnected(bridge.isConnected());
		setData(bridge.getData() as HostData);

		// Host pushes fresh data via shell.updateData() -> bridge re-emits.
		const onData = () => {
			setConnected(bridge.isConnected());
			setData(bridge.getData() as HostData);
		};
		bridge.addEventListener("data", onData);
		bridge.addEventListener("connected", onData);

		// Surface any bridge console error visibly in the UI.
		const originalError = console.error;
		console.error = (...args: unknown[]) => {
			const msg = args
				.map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
				.join(" ");
			if (msg.includes("[Bridge]") || msg.toLowerCase().includes("bridge")) {
				setBridgeError(msg);
			}
			originalError.apply(console, args as []);
		};

		// If not connected within 4s, show a diagnostic hint.
		const t = window.setTimeout(() => {
			if (!bridge.isConnected()) {
				setBridgeError((prev) =>
					prev ??
					"Bridge did not connect within 4s. Likely running outside the Salesforce <lwc-shell>, or a shell/bridge version mismatch.",
				);
			}
		}, 4000);

		return () => {
			bridge.removeEventListener("data", onData);
			bridge.removeEventListener("connected", onData);
			console.error = originalError;
			window.clearTimeout(t);
		};
	}, []);

	const runQuery = async (): Promise<void> => {
		setGqlError(null);
		try {
			const res = await bridge.graphql<{
				uiapi?: {
					query?: {
						Account?: { edges?: { node?: { Name?: { value?: string } } }[] };
					};
				};
			}>({
				query: `query { uiapi { query { Account(first: 5) { edges { node { Name { value } } } } } } }`,
			});
			if (res.errors?.length) {
				setGqlError(res.errors.map((e) => e.message).join("; "));
				return;
			}
			const names =
				res.data?.uiapi?.query?.Account?.edges
					?.map((e) => e.node?.Name?.value ?? "")
					.filter(Boolean) ?? [];
			setAccounts(names);
		} catch (e) {
			setGqlError(e instanceof Error ? e.message : String(e));
		}
	};

	const sendEvent = (): void => {
		bridge.dispatchEvent(
			new CustomEvent("policy-selected", {
				detail: { policyId: "PWV-100234", at: "guest" },
			}),
		);
	};

	return (
		<div style={{ fontFamily: "system-ui, sans-serif", padding: 24, color: "#1a2a3a" }}>
			<h1 style={{ fontSize: 24, display: "flex", gap: 10 }}>
				🏛️ RS CoPilot — MFE Guest
			</h1>

			<section style={card}>
				<h2 style={h2}>Bridge status</h2>
				<p>Connected to host: <strong>{connected ? "✅ yes" : "❌ no"}</strong></p>
				<p>instanceId: <code>{bridge.instanceId ?? "—"}</code></p>
				{bridgeError && (
					<p style={{ color: "#b3413a", background: "#fbeaea", padding: "10px 12px", borderRadius: 6, fontSize: 13, marginTop: 8 }}>
						⚠️ {bridgeError}
					</p>
				)}
			</section>

			<section style={card}>
				<h2 style={h2}>Host data <span style={muted}>(shell.updateData → bridge.getData)</span></h2>
				<pre style={pre}>{JSON.stringify(data, null, 2)}</pre>
			</section>

			<section style={card}>
				<h2 style={h2}>Org data via bridge.graphql()</h2>
				<button style={btn} onClick={runQuery}>Query 5 Accounts</button>
				{gqlError && <p style={{ color: "#b3413a" }}>✖ {gqlError}</p>}
				{accounts.length > 0 && (
					<ul>{accounts.map((n, i) => <li key={i}>{n}</li>)}</ul>
				)}
			</section>

			<section style={card}>
				<h2 style={h2}>Guest → host event</h2>
				<button style={btn} onClick={sendEvent}>Fire "policy-selected"</button>
				<p style={muted}>Host LWC listens via shell.addEventListener("policy-selected", …)</p>
			</section>
		</div>
	);
}

const card: React.CSSProperties = { border: "1px solid #e3e3e3", borderRadius: 8, padding: 16, marginTop: 16 };
const h2: React.CSSProperties = { fontSize: 16, margin: "0 0 10px" };
const muted: React.CSSProperties = { color: "#9aa5b1", fontWeight: 400, fontSize: 13 };
const pre: React.CSSProperties = { background: "#0f1720", color: "#d6e2f0", padding: 12, borderRadius: 6, fontSize: 12, overflow: "auto" };
const btn: React.CSSProperties = { padding: "8px 16px", border: "1px solid #e3e3e3", borderRadius: 6, background: "#fff", cursor: "pointer", marginBottom: 8 };