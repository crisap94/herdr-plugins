import { err, ok, type Result } from '#src/protocol/result.ts';
import { brand, type Brand } from './brand.ts';
import type { ParseFailure } from './parse-failure.ts';

export type Count = Brand<number, 'Count'>;
export type PositiveCount = Brand<number, 'PositiveCount'>;

export function parseCount(input: unknown): Result<Count, ParseFailure> {
    if (typeof input !== 'number') {
        return err({ kind: 'not-a-number' });
    }
    if (!Number.isInteger(input)) {
        return err({ kind: 'not-an-integer' });
    }
    if (input < 0 || !Number.isSafeInteger(input)) {
        return err({ kind: 'out-of-range' });
    }
    return ok(brand<number, 'Count'>(input));
}

export function parsePositiveCount(input: unknown): Result<PositiveCount, ParseFailure> {
    const count = parseCount(input);
    if (count.kind === 'err') {
        return count;
    }
    if (count.value === 0) {
        return err({ kind: 'out-of-range' });
    }
    return ok(brand<number, 'PositiveCount'>(count.value));
}
