import { err, ok, type Result } from '#src/protocol/result.ts';
import { brand, type Brand } from '@stateforge-labs/session-ledger/unstable/recap/domain/brand.ts';
import type { ParseFailure } from '@stateforge-labs/session-ledger/unstable/recap/domain/parse-failure.ts';
import { parseNonEmptyText } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';

export type GitPath = Brand<string, 'GitPath'>;

const NUL = '\u0000';
const SEPARATOR = '/';

export function parseGitPath(input: unknown): Result<GitPath, ParseFailure> {
    const text = parseNonEmptyText(input);
    if (text.kind === 'err') {
        return text;
    }
    if (text.value.includes(NUL) || text.value.startsWith(SEPARATOR)) {
        return err({ kind: 'out-of-range' });
    }
    return ok(brand<string, 'GitPath'>(text.value));
}
