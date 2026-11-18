import { ok, type Result } from '#src/protocol/result.ts';
import { brand, type Brand } from './brand.ts';
import type { ParseFailure } from './parse-failure.ts';
import { parseNonEmptyText } from './text.ts';

export type Directory = Brand<string, 'Directory'>;

export function parseDirectory(input: unknown): Result<Directory, ParseFailure> {
    const text = parseNonEmptyText(input);
    if (text.kind === 'err') {
        return text;
    }
    return ok(brand<string, 'Directory'>(text.value));
}
