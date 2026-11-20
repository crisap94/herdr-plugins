import { err, ok, type Result } from '#src/protocol/result.ts';
import { brand, type Brand } from '@stateforge-labs/session-ledger/unstable/recap/domain/brand.ts';
import type { ParseFailure } from '@stateforge-labs/session-ledger/unstable/recap/domain/parse-failure.ts';

export type Pid = Brand<number, 'Pid'>;

const DECIMAL_DIGITS = /^[0-9]+$/u;

export function parsePid(input: unknown): Result<Pid, ParseFailure> {
    if (typeof input === 'string') {
        if (!DECIMAL_DIGITS.test(input)) {
            return err({ kind: 'not-a-number' });
        }
        const digits = Number(input);
        return digits < 1 || !Number.isSafeInteger(digits) ? err({ kind: 'out-of-range' }) : ok(brand<number, 'Pid'>(digits));
    }
    const value = input;
    if (typeof value !== 'number') {
        return err({ kind: 'not-a-number' });
    }
    if (!Number.isInteger(value)) {
        return err({ kind: 'not-an-integer' });
    }
    if (value < 1 || !Number.isSafeInteger(value)) {
        return err({ kind: 'out-of-range' });
    }
    return ok(brand<number, 'Pid'>(value));
}
