import { err, ok, type Result } from '@stateforge-labs/session-ledger';
import { brand, type Brand } from '@stateforge-labs/session-ledger';
import type { ParseFailure } from '@stateforge-labs/session-ledger';

export type TypeId = Brand<string, 'TypeId'>;

export const uncheckedTypeId = brand<string, 'TypeId'>;

export type TypeIdPrefix = 'tscr' | 'chap' | 'bnd' | 'task' | 'run' | 'req' | 'hnd' | 'cmp' | 'vrd' | 'fct' | 'dcn';

const TYPE_ID = /^(tscr|chap|bnd|task|run|req|hnd|cmp|vrd|fct|dcn)_[0-7][0-9a-hjkmnp-tv-z]{25}$/u;

export function parseTypeId(input: unknown): Result<TypeId, ParseFailure> {
    if (typeof input !== 'string') {
        return err({ kind: 'not-a-string' });
    }
    if (!TYPE_ID.test(input)) {
        return err({ kind: 'out-of-range' });
    }
    return ok(brand<string, 'TypeId'>(input));
}
