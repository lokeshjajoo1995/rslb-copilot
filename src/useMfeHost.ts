import { useEffect, useState } from "react";
import bridge from "@salesforce/experimental-mfe-bridge";

/**
 * Reads MFE host context (pushed via shell.updateData) and, when a recordId is
 * present, fetches that Lead's name through bridge.graphql() — mirroring how the
 * native UI Bundle used the Data SDK. Returns null values when running
 * standalone (outside the Salesforce shell).
 */
/** Account context pushed from the host when placed on an Account record page. */
export interface AccountContext {
	id: string;
	name: string;
	email: string;
}

interface MfeHost {
	connected: boolean;
	recordId: string | null;
	userId: string | null;
	leadName: string | null;
	/** { id, name, email } on an Account record page; null on the utility bar. */
	account: AccountContext | null;
	/** The Salesforce tab/page URL the component is embedded in (getTabURL). */
	pageUrl: string | null;
}

interface HostData {
	recordId?: string;
	userId?: string;
	// The host sends account fields as FLAT scalars because the lwc-shell data
	// channel stringifies values (a nested object would arrive as
	// "[object Object]"). We reassemble them below.
	accountId?: string;
	accountName?: string;
	accountEmail?: string;
	pageUrl?: string | null;
	[k: string]: unknown;
}

export function useMfeHost(): MfeHost {
	const [connected, setConnected] = useState<boolean>(false);
	const [recordId, setRecordId] = useState<string | null>(null);
	const [userId, setUserId] = useState<string | null>(null);
	const [leadName, setLeadName] = useState<string | null>(null);
	const [account, setAccount] = useState<AccountContext | null>(null);
	const [pageUrl, setPageUrl] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		const readAndFetch = () => {
			if (cancelled) return;
			setConnected(bridge.isConnected());
			const data = bridge.getData() as HostData;
			const id = typeof data?.recordId === "string" ? data.recordId : null;
			setRecordId(id);
			setUserId(typeof data?.userId === "string" ? data.userId : null);
			// Reassemble the account from the flat scalar fields. Present only on
			// an Account record page; on the utility bar accountId is empty → null.
			const accId = typeof data?.accountId === "string" ? data.accountId : "";
			setAccount(
				accId
					? {
							id: accId,
							name: typeof data?.accountName === "string" ? data.accountName : "",
							email: typeof data?.accountEmail === "string" ? data.accountEmail : "",
					  }
					: null,
			);
			setPageUrl(typeof data?.pageUrl === "string" ? data.pageUrl : null);
			if (id) void fetchLead(id);
		};

		const fetchLead = async (id: string): Promise<void> => {
			try {
				const res = await bridge.graphql<{
					uiapi?: {
						query?: {
							Lead?: { edges?: { node?: { Name?: { value?: string } } }[] };
						};
					};
				}>({
					query: `query LeadName($id: ID) {
						uiapi { query { Lead(where: { Id: { eq: $id } }, first: 1) {
							edges { node { Name { value } } }
						} } }
					}`,
					variables: { id },
				});
				const name =
					res.data?.uiapi?.query?.Lead?.edges?.[0]?.node?.Name?.value ?? null;
				if (!cancelled && name) setLeadName(name);
			} catch {
				// standalone / no access — leave name null
			}
		};

		readAndFetch();
		bridge.addEventListener("data", readAndFetch);
		bridge.addEventListener("connected", readAndFetch);
		return () => {
			cancelled = true;
			bridge.removeEventListener("data", readAndFetch);
			bridge.removeEventListener("connected", readAndFetch);
		};
	}, []);

	return { connected, recordId, userId, leadName, account, pageUrl };
}