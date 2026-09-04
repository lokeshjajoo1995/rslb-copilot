import { useEffect, useState } from "react";
import { getViewSDK } from "@salesforce/platform-sdk";

/**
 * GA counterpart to useMfeHost (which used @salesforce/experimental-mfe-bridge
 * with the dev-preview lwc-shell). Here we read host context from the Platform
 * SDK exposed by <lightning-ui-embedding>:
 *
 *   getViewSDK()                       -> async, resolves to the SDK
 *   sdk.getUiState()                   -> { state: { props }, subscribe }
 *   state.props                        -> the object the host bound to `props`
 *   subscribe(next => next.props)      -> fires on every host push
 *
 * Unlike the lwc-shell path, `props` is a real object — nested `account`
 * survives intact (no "[object Object]" stringification), so we read it
 * directly rather than reassembling flat scalar fields.
 */
export interface AccountContext {
	id: string;
	name: string;
	email: string;
}

interface HostProps {
	recordId?: string | null;
	source?: string;
	account?: AccountContext | null;
}

interface ViewSdkHost {
	connected: boolean;
	recordId: string | null;
	account: AccountContext | null;
	/** Diagnostic: what happened during the getViewSDK handshake. */
	debug: string;
}

export function useViewSdkHost(): ViewSdkHost {
	const [connected, setConnected] = useState(false);
	const [props, setProps] = useState<HostProps>({});
	const [debug, setDebug] = useState("init: calling getViewSDK()…");

	useEffect(() => {
		let cancelled = false;
		let unsubscribe: (() => void) | undefined;

		// DECISIVE DIAGNOSTIC — is the ui-embedding session even possible here?
		// The guest handshake REQUIRES a `hostMetaData` query param on the iframe
		// URL (<lightning-ui-embedding> is supposed to append it: instanceId +
		// hostAppOrigin). If it's absent, getViewSDK() can NEVER connect — that's a
		// host/platform problem, not guest code. Surface it in the panel so we stop
		// guessing: we can read reject-vs-hang and metadata-present straight off the
		// screen without switching the console to the iframe frame.
		let hasHostMeta = false;
		try {
			hasHostMeta = new URLSearchParams(window.location.search).has("hostMetaData");
		} catch {
			hasHostMeta = false;
		}
		// eslint-disable-next-line no-console
		console.log(
			"uiEmbed[guest] BOOT url=", window.location.href,
			"| hostMetaData present=", hasHostMeta,
			"| inIframe=", (() => { try { return window.parent !== window; } catch { return true; } })(),
		);
		setDebug(
			`init: getViewSDK()… | hostMetaData=${hasHostMeta ? "PRESENT" : "MISSING"} | iframe=${(() => { try { return window.parent !== window; } catch { return true; } })()}`,
		);

		// RAW MESSAGE SNIFFER — the final decisive diagnostic. hostMetaData is
		// PRESENT yet getViewSDK() HANGS, meaning the host never completed the port
		// handshake. Two possibilities remain, with different fixes:
		//   (a) host sends NOTHING back  → host/platform-side (enablement/preview) —
		//       no guest fix exists.
		//   (b) host DOES transfer a port but from an origin/source/instanceId that
		//       the bridge's validator rejects → it silently drops it and waits
		//       forever. That we could potentially address.
		// This passive listener logs every inbound postMessage (origin, whether it
		// carried a MessagePort, a shape hint) so we can tell (a) from (b) without
		// guessing. It does NOT interfere with the bridge's own listener.
		const sniffer = (ev: MessageEvent) => {
			let shape = "";
			try {
				shape =
					typeof ev.data === "object" && ev.data
						? "keys=" + Object.keys(ev.data).slice(0, 6).join(",")
						: "primitive:" + String(ev.data).slice(0, 40);
			} catch {
				shape = "unreadable";
			}
			// eslint-disable-next-line no-console
			console.log(
				"uiEmbed[guest] RAW MSG from origin=", ev.origin,
				"| fromParent=", ev.source === window.parent,
				"| ports=", ev.ports?.length ?? 0,
				"|", shape,
			);
		};
		window.addEventListener("message", sniffer);

		// A visible "still hanging" marker: if getViewSDK() neither resolves nor
		// rejects within 6s, the panel says so — distinguishing a true hang (host
		// never completed the port handshake) from a fast reject (no session). This
		// does NOT call getViewSDK() again — it only updates the debug text.
		const hangTimer = setTimeout(() => {
			if (cancelled) return;
			setDebug((d) =>
				d.startsWith("connected") || d.startsWith("update") || d.includes("REJECTED")
					? d
					: `HANG >6s (no resolve, no reject) | hostMetaData=${hasHostMeta ? "PRESENT" : "MISSING"} — host never completed the port handshake`,
			);
			// eslint-disable-next-line no-console
			console.log("uiEmbed[guest] HANG: getViewSDK() unsettled after 6s. hostMetaData=", hasHostMeta);
		}, 6000);

		// Call getViewSDK() exactly ONCE. It is a singleton handshake — calling it
		// again while the first is in flight can interfere with / invalidate the
		// pending connection (an earlier retry loop did exactly that and broke a
		// previously-consistent connection). So: one call, no retry, no timeout
		// racing the SDK. If it hangs, that's a host/preview issue to chase, not
		// something a second call fixes.
		getViewSDK()
			.then((sdk) => {
				clearTimeout(hangTimer);
				if (cancelled) return;
				const ui = sdk.getUiState?.();
				if (!ui) {
					setDebug("getViewSDK() resolved but getUiState() returned nothing.");
					return;
				}
				setConnected(true);
				const initial = (ui.state.props ?? {}) as HostProps;
				// eslint-disable-next-line no-console
				console.log("uiEmbed[guest] INITIAL getUiState().state.props:", JSON.stringify(ui.state.props ?? {}), "| account=", JSON.stringify(initial.account ?? null));
				setProps(initial);
				setDebug("connected ✓ props=" + JSON.stringify(ui.state.props ?? {}));
				unsubscribe = ui.subscribe((next: { props?: HostProps }) => {
					// eslint-disable-next-line no-console
					console.log("uiEmbed[guest] SUBSCRIBE update props:", JSON.stringify(next.props ?? {}), "| account=", JSON.stringify(next.props?.account ?? null));
					setProps((next.props ?? {}) as HostProps);
					setDebug("update ✓ props=" + JSON.stringify(next.props ?? {}));
				});
			})
			.catch((e: unknown) => {
				clearTimeout(hangTimer);
				if (cancelled) return;
				setDebug(
					"getViewSDK() REJECTED: " +
						(e instanceof Error ? `${e.name}: ${e.message}` : String(e)),
				);
			});

		return () => {
			cancelled = true;
			clearTimeout(hangTimer);
			window.removeEventListener("message", sniffer);
			unsubscribe?.();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return {
		connected,
		recordId: props.recordId ?? null,
		account: props.account ?? null,
		debug,
	};
}