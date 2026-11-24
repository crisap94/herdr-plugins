import { err, ok, type Result } from '@stateforge-labs/session-ledger';
import { brand, type Brand } from '@stateforge-labs/session-ledger';
import type { ParseFailure } from '@stateforge-labs/session-ledger';
import { parseNonEmptyText } from '@stateforge-labs/session-ledger';

export type FsPath = Brand<string, 'FsPath'>;

export const fsPathOf = brand<string, 'FsPath'>;

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
