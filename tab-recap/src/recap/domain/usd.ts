import { err, ok, type Result } from '#src/protocol/result.ts';
import { brand, type Brand } from '@stateforge-labs/session-ledger/unstable/recap/domain/brand.ts';
import type { ParseFailure } from '@stateforge-labs/session-ledger/unstable/recap/domain/parse-failure.ts';

export type Usd = Brand<number, 'Usd'>;

export function parseUsd(input: unknown): Result<Usd, ParseFailure> {
    if (typeof input !== 'number') {
        return err({ kind: 'not-a-number' });
    }
    if (!Number.isFinite(input)) {
        return err({ kind: 'out-of-range' });
    }
    return ok(brand<number, 'Usd'>(input));
}
