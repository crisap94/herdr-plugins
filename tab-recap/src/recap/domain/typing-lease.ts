// The typing lease: whoever types into a pane holds `typing-<tool>` = its epoch stamp while it types. tab-recap types a compaction brief only when no
// other tool's lease on the pane is earlier than its own (or the same stamp with a smaller name). A lease left by a crashed writer expires on its own:
// herdr drops a token past its time to live, so it is simply not there. Pure.

export const LEASE = 'typing-tab-recap';
export const LEASE_TTL_MS = 60_000;
const FOREIGN = /^typing-.+$/;

/** True when another tool's live lease on the pane comes before tab-recap's `stamp`. */
export function leaseBlocked(tokens: Readonly<Record<string, string>>, stamp: number): boolean {
    return Object.entries(tokens).some(([name, value]) => {
        if (!FOREIGN.test(name) || name === LEASE) {
            return false;
        }
        const theirs = value.trim() === '' ? 0 : Number(value);
        return Number.isFinite(theirs) && theirs > 0 && (theirs < stamp || (theirs === stamp && name < LEASE));
    });
}
