import { err, ok, type Result } from '@stateforge-labs/session-ledger';
import type { ParseFailure } from '@stateforge-labs/session-ledger';

export type Presence = 'present' | 'absent';

export function parsePresence(input: unknown): Result<Presence, ParseFailure> {
    if (typeof input !== 'string') {
        return err({ kind: 'not-a-string' });
    }
    if (input === 'present' || input === 'absent') {
        return ok(input);
    }
    return err({ kind: 'out-of-range' });
}
