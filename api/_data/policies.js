// Mock insurance-policy data + helpers.
// Files/folders prefixed with "_" are NOT exposed as endpoints by Vercel,
// so this module is safe to share across api/ functions.

/** @typedef {Object} Policy
 * @property {string} id
 * @property {string} holderName
 * @property {string} productType
 * @property {string} status
 * @property {number} accountValue
 * @property {number} protectedWithdrawalValue
 * @property {number} annualBenefitWithdrawalAmount
 * @property {string} riderAnniversary
 * @property {string} agentCode
 */

/** @type {Policy[]} */
export const policies = [
	{
		id: "PWV-100234",
		holderName: "Sarah Loehr",
		productType: "Variable Annuity",
		status: "Active",
		accountValue: 248500.75,
		protectedWithdrawalValue: 310000,
		annualBenefitWithdrawalAmount: 15500,
		riderAnniversary: "2026-03-14",
		agentCode: "AG-4471",
	},
	{
		id: "PWV-100987",
		holderName: "Marcus Bell",
		productType: "Variable Annuity",
		status: "Active",
		accountValue: 512300.0,
		protectedWithdrawalValue: 560000,
		annualBenefitWithdrawalAmount: 28000,
		riderAnniversary: "2025-11-02",
		agentCode: "AG-2210",
	},
	{
		id: "PWV-101456",
		holderName: "Priya Nair",
		productType: "Fixed Indexed Annuity",
		status: "Lapsed",
		accountValue: 87200.5,
		protectedWithdrawalValue: 95000,
		annualBenefitWithdrawalAmount: 4750,
		riderAnniversary: "2026-07-21",
		agentCode: "AG-4471",
	},
	{
		id: "PWV-102003",
		holderName: "David Okafor",
		productType: "Variable Annuity",
		status: "Pending",
		accountValue: 155000.0,
		protectedWithdrawalValue: 155000,
		annualBenefitWithdrawalAmount: 0,
		riderAnniversary: "2026-01-09",
		agentCode: "AG-3390",
	},
];

/** Return all policies, optionally filtered by search text and/or status. */
export function listPolicies({ q, status } = {}) {
	let result = policies;
	if (status) {
		result = result.filter(
			(p) => p.status.toLowerCase() === String(status).toLowerCase(),
		);
	}
	if (q) {
		const needle = String(q).toLowerCase();
		result = result.filter(
			(p) =>
				p.holderName.toLowerCase().includes(needle) ||
				p.id.toLowerCase().includes(needle) ||
				p.agentCode.toLowerCase().includes(needle),
		);
	}
	return result;
}

/** Find a single policy by id (case-insensitive). */
export function getPolicy(id) {
	if (!id) return null;
	const needle = String(id).toLowerCase();
	return policies.find((p) => p.id.toLowerCase() === needle) ?? null;
}