import { err, ok, type Result } from '@stateforge-labs/session-ledger';
import { brand, type Brand } from '@stateforge-labs/session-ledger';
import type { ParseFailure } from '@stateforge-labs/session-ledger';

export type RunId = Brand<string, 'RunId'>;
export type FactId = Brand<string, 'FactId'>;
export type Born = Brand<boolean, 'Born'>;

export const bornOf = brand<boolean, 'Born'>;

const RUN_TYPE_ID = /^run_[0-7][0-9a-hjkmnp-tv-z]{25}$/u;
const FACT_TYPE_ID = /^fct_[0-7][0-9a-hjkmnp-tv-z]{25}$/u;

export function parseRunId(input: unknown): Result<RunId, ParseFailure> {
    if (typeof input !== 'string') {
        return err({ kind: 'not-a-string' });
    }
    if (!RUN_TYPE_ID.test(input)) {
        return err({ kind: 'out-of-range' });
    }
    return ok(brand<string, 'RunId'>(input));
}

export function parseFactId(input: unknown): Result<FactId, ParseFailure> {
    if (typeof input !== 'string') {
        return err({ kind: 'not-a-string' });
    }
    if (!FACT_TYPE_ID.test(input)) {
        return err({ kind: 'out-of-range' });
    }
    return ok(brand<string, 'FactId'>(input));
}
