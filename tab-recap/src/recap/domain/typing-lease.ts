export const LEASE = 'typing-tab-recap';
export const LEASE_TTL_MS = 60_000;
const FOREIGN = /^typing-.+$/;

export function leaseBlocked(tokens: Readonly<Record<string, string>>, stamp: number): boolean {
    return Object.entries(tokens).some(([name, value]) => {
        if (!FOREIGN.test(name) || name === LEASE) {
            return false;
        }
        const theirs = value.trim() === '' ? 0 : Number(value);
        return Number.isFinite(theirs) && theirs > 0 && (theirs < stamp || (theirs === stamp && name < LEASE));
    });
}
