import { err, ok, type Result } from '@stateforge-labs/session-ledger';
import { brand, type Brand } from '@stateforge-labs/session-ledger';
import { parseCount } from '@stateforge-labs/session-ledger';
import type { ParseFailure } from '@stateforge-labs/session-ledger';

export type FactIndex = Brand<number, 'FactIndex'>;

export function parseFactIndex(input: unknown): Result<FactIndex, ParseFailure> {
    const index = parseCount(input);
    if (index.kind === 'err') {
        return err(index.error);
    }
    return ok(brand<number, 'FactIndex'>(index.value));
}
