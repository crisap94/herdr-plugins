import { err, must, ok, type Result } from '@stateforge-labs/session-ledger';
import { brand, type Brand } from '@stateforge-labs/session-ledger';
import type { Count } from '@stateforge-labs/session-ledger';
import type { ParseFailure } from '@stateforge-labs/session-ledger';

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

export function parseFitting(input: unknown): Result<Fitting, ParseFailure> {
    if (typeof input !== 'boolean') {
        return err({ kind: 'out-of-range' });
    }
    return ok(brand<boolean, 'Fitting'>(input));
}

export function fits(budget: ByteBudget, bytes: Count): Fitting { return must(parseFitting(bytes <= budget)); }
