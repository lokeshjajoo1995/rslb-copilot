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

		// The dev-preview getViewSDK() ↔ <lightning-ui-embedding> handshake is
		// RACY: on the same page it sometimes connects instantly and sometimes
		// hangs forever (never resolves, never rejects). Since a retry usually
		// wins the race, we race each getViewSDK() attempt against a timeout and
		// retry a bounded number of times before giving up.
		const MAX_ATTEMPTS = 6;
		const ATTEMPT_TIMEOUT_MS = 2500;

		const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
			new Promise((resolve, reject) => {
				const to = window.setTimeout(() => reject(new Error("attempt-timeout")), ms);
				p.then(
					(v) => {
						window.clearTimeout(to);
						resolve(v);
					},
					(e) => {
						window.clearTimeout(to);
						reject(e);
					},
				);
			});

		const connect = async () => {
			for (let attempt = 1; attempt <= MAX_ATTEMPTS && !cancelled; attempt++) {
				setDebug(`getViewSDK() attempt ${attempt}/${MAX_ATTEMPTS}…`);
				try {
					const sdk = await withTimeout(getViewSDK(), ATTEMPT_TIMEOUT_MS);
					if (cancelled) return;
					const ui = sdk.getUiState?.();
					if (!ui) {
						setDebug(`attempt ${attempt}: resolved but getUiState() empty; retrying…`);
						continue;
					}
					setConnected(true);
					setProps((ui.state.props ?? {}) as HostProps);
					setDebug("connected ✓ props=" + JSON.stringify(ui.state.props ?? {}));
					unsubscribe = ui.subscribe((next: { props?: HostProps }) => {
						setProps((next.props ?? {}) as HostProps);
						setDebug("update ✓ props=" + JSON.stringify(next.props ?? {}));
					});
					return; // success
				} catch (e) {
					if (cancelled) return;
					const msg = e instanceof Error ? e.message : String(e);
					setDebug(`attempt ${attempt} failed (${msg}); retrying…`);
					// brief backoff before the next attempt
					await new Promise((r) => window.setTimeout(r, 400));
				}
			}
			if (!cancelled) {
				setDebug(
					`❌ getViewSDK() did not connect after ${MAX_ATTEMPTS} attempts — the host <lightning-ui-embedding> bridge isn't responding (dev-preview flakiness).`,
				);
			}
		};

		void connect();

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