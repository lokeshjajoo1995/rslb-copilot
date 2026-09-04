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
}

export function useViewSdkHost(): ViewSdkHost {
	const [connected, setConnected] = useState(false);
	const [props, setProps] = useState<HostProps>({});

	useEffect(() => {
		let cancelled = false;
		let unsubscribe: (() => void) | undefined;

		getViewSDK()
			.then((sdk) => {
				if (cancelled) return;
				const ui = sdk.getUiState?.();
				if (!ui) return;
				setConnected(true);
				setProps((ui.state.props ?? {}) as HostProps);
				unsubscribe = ui.subscribe((next: { props?: HostProps }) => {
					setProps((next.props ?? {}) as HostProps);
				});
			})
			.catch(() => {
				// Running standalone (not inside <lightning-ui-embedding>).
			});

		return () => {
			cancelled = true;
			unsubscribe?.();
		};
	}, []);

	return {
		connected,
		recordId: props.recordId ?? null,
		account: props.account ?? null,
	};
}