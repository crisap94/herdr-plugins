import type { Text } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';
import type { Instant } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';
export const LEASE = 'typing-tab-recap';
export const LEASE_TTL_MS = 60_000;
const FOREIGN = /^typing-.+$/;

export type LeaseRead = 'blocked' | 'clear';

export function leaseBlocked(tokens: ReadonlyMap<Text, Text>, stamp: Instant): LeaseRead {
    const blocked = [...tokens].some(([name, value]) => {
        if (!FOREIGN.test(name) || name === LEASE) {
            return false;
        }
        const theirs = value.trim() === '' ? 0 : Number(value);
        return Number.isFinite(theirs) && theirs > 0 && (theirs < stamp || (theirs === stamp && name < LEASE));
    });
    return blocked ? 'blocked' : 'clear';
}
