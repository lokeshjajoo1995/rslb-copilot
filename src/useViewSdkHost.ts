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

		// Call getViewSDK() exactly ONCE. It is a singleton handshake — calling it
		// again while the first is in flight can interfere with / invalidate the
		// pending connection (an earlier retry loop did exactly that and broke a
		// previously-consistent connection). So: one call, no retry, no timeout
		// racing the SDK. If it hangs, that's a host/preview issue to chase, not
		// something a second call fixes.
		getViewSDK()
			.then((sdk) => {
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
				if (cancelled) return;
				setDebug(
					"getViewSDK() REJECTED: " +
						(e instanceof Error ? `${e.name}: ${e.message}` : String(e)),
				);
			});

		return () => {
			cancelled = true;
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