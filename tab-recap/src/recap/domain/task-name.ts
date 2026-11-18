import { ok, type Result } from '#src/protocol/result.ts';
import { brand, type Brand } from '@stateforge-labs/session-ledger/unstable/recap/domain/brand.ts';
import type { ParseFailure } from '@stateforge-labs/session-ledger/unstable/recap/domain/parse-failure.ts';
import { parseNonEmptyText } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';

export type TaskName = Brand<string, 'TaskName'>;

export function parseTaskName(input: unknown): Result<TaskName, ParseFailure> {
    const text = parseNonEmptyText(input);
    if (text.kind === 'err') {
        return text;
    }
    return ok(brand<string, 'TaskName'>(text.value));
}
