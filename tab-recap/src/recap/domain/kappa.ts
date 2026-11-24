import { err, ok, type Result } from '@stateforge-labs/session-ledger';
import { brand, type Brand } from '@stateforge-labs/session-ledger';
import type { ParseFailure } from '@stateforge-labs/session-ledger';

export type Kappa = Brand<number, 'Kappa'>;

export type Trusted = Brand<boolean, 'Trusted'>;

export const trustedOf = brand<boolean, 'Trusted'>;

export function parseKappa(input: unknown): Result<Kappa, ParseFailure> {
    if (typeof input !== 'number' || Number.isNaN(input)) {
        return err({ kind: 'not-a-number' });
    }
    if (input < -1 || input > 1) {
        return err({ kind: 'out-of-range' });
    }
    return ok(brand<number, 'Kappa'>(input));
}
