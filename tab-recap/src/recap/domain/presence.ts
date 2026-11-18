import { err, ok, type Result } from '#src/protocol/result.ts';
import type { ParseFailure } from '@stateforge-labs/session-ledger/unstable/recap/domain/parse-failure.ts';

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
