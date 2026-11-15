import { err, ok, type Result } from '#src/protocol/result.ts';
import { brand, type Brand } from './brand.ts';
import type { ParseFailure } from './parse-failure.ts';
import { parseNonEmptyText } from './text.ts';

export type FsPath = Brand<string, 'FsPath'>;

const NUL = '\u0000';

export function parseFsPath(input: unknown): Result<FsPath, ParseFailure> {
    const text = parseNonEmptyText(input);
    if (text.kind === 'err') {
        return text;
    }
    if (text.value.includes(NUL)) {
        return err({ kind: 'out-of-range' });
    }
    return ok(brand<string, 'FsPath'>(text.value));
}
