import { ok, type Result } from '@stateforge-labs/session-ledger';
import { brand, type Brand } from '@stateforge-labs/session-ledger';
import type { ParseFailure } from '@stateforge-labs/session-ledger';
import { parseNonEmptyText } from '@stateforge-labs/session-ledger';

export type TaskName = Brand<string, 'TaskName'>;

export function parseTaskName(input: unknown): Result<TaskName, ParseFailure> {
    const text = parseNonEmptyText(input);
    if (text.kind === 'err') {
        return text;
    }
    return ok(brand<string, 'TaskName'>(text.value));
}
