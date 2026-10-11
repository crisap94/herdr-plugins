import { ok, type Result } from '#src/protocol/result.ts';
import { brand, type Brand } from './brand.ts';
import type { ParseFailure } from './parse-failure.ts';
import { parseNonEmptyText } from './text.ts';

export type TaskName = Brand<string, 'TaskName'>;

export function parseTaskName(input: unknown): Result<TaskName, ParseFailure> {
    const text = parseNonEmptyText(input);
    if (text.kind === 'err') {
        return text;
    }
    return ok(brand<string, 'TaskName'>(text.value));
}
