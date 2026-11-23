import { err, ok, type Result } from '#src/protocol/result.ts';
import { brand, type Brand } from '@stateforge-labs/session-ledger/unstable/recap/domain/brand.ts';
import type { Count } from './count.ts';
import type { ParseFailure } from '@stateforge-labs/session-ledger/unstable/recap/domain/parse-failure.ts';

export type ByteBudget = Brand<number, 'ByteBudget'>;

export type Fitting = Brand<boolean, 'Fitting'>;

export function parseByteBudget(input: unknown): Result<ByteBudget, ParseFailure> {
    if (typeof input !== 'number') {
        return err({ kind: 'not-a-number' });
    }
    if (!Number.isSafeInteger(input) || input <= 0) {
        return err({ kind: 'out-of-range' });
    }
    return ok(brand<number, 'ByteBudget'>(input));
}

export function byteBudgetOf(bytes: Count): ByteBudget {
    const budget = parseByteBudget(bytes);
    if (budget.kind === 'err') {
        throw new RangeError('a byte budget is a positive integer');
    }
    return budget.value;
}

export function fits(budget: ByteBudget, bytes: Count): Fitting { return brand<boolean, 'Fitting'>(bytes <= budget); }
