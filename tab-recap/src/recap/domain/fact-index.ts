import { err, ok, type Result } from '#src/protocol/result.ts';
import { brand, type Brand } from '@stateforge-labs/session-ledger/unstable/recap/domain/brand.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import type { ParseFailure } from '@stateforge-labs/session-ledger/unstable/recap/domain/parse-failure.ts';

export type FactIndex = Brand<number, 'FactIndex'>;

export function parseFactIndex(input: unknown): Result<FactIndex, ParseFailure> {
    const index = parseCount(input);
    if (index.kind === 'err') {
        return err(index.error);
    }
    return ok(brand<number, 'FactIndex'>(index.value));
}
