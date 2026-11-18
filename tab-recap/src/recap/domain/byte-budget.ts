import { err, ok, type Result } from '#src/protocol/result.ts';
import { brand, type Brand } from '@stateforge-labs/session-ledger/unstable/recap/domain/brand.ts';
import type { ParseFailure } from '@stateforge-labs/session-ledger/unstable/recap/domain/parse-failure.ts';

export type ByteBudget = Brand<number, 'ByteBudget'>;

export function parseByteBudget(input: unknown): Result<ByteBudget, ParseFailure> {
    if (typeof input !== 'number') {
        return err({ kind: 'not-a-number' });
    }
    if (!Number.isSafeInteger(input) || input <= 0) {
        return err({ kind: 'out-of-range' });
    }
    return ok(brand<number, 'ByteBudget'>(input));
}

export { byteBudgetOf, fits } from './legacy.ts';
