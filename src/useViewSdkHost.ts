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

		// If the SDK never resolves within 5s, say so (vs a silent spinner).
		const t = window.setTimeout(() => {
			if (!cancelled) setDebug((d) => (connected ? d : d + " | ⏱ 5s: getViewSDK() still pending"));
		}, 5000);

		getViewSDK()
			.then((sdk) => {
				if (cancelled) return;
				setDebug("getViewSDK() resolved; calling getUiState()…");
				const ui = sdk.getUiState?.();
				if (!ui) {
					setDebug("getViewSDK() resolved but getUiState() returned nothing.");
					return;
				}
				setConnected(true);
				setProps((ui.state.props ?? {}) as HostProps);
				setDebug("connected ✓ props=" + JSON.stringify(ui.state.props ?? {}));
				unsubscribe = ui.subscribe((next: { props?: HostProps }) => {
					setProps((next.props ?? {}) as HostProps);
					setDebug("update ✓ props=" + JSON.stringify(next.props ?? {}));
				});
			})
			.catch((e: unknown) => {
				if (cancelled) return;
				// Surface the rejection instead of silently falling back.
				setDebug(
					"getViewSDK() REJECTED: " +
						(e instanceof Error ? `${e.name}: ${e.message}` : String(e)),
				);
			});

		return () => {
			cancelled = true;
			window.clearTimeout(t);
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