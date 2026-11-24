import { brand } from '@stateforge-labs/session-ledger';
import type { HarnessKind } from '#src/recap/domain/ids.ts';
import { parseFsPath } from '#src/recap/domain/fs-path.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';

export const kindOf = (kind: string): HarnessKind => brand<string, 'HarnessKind'>(kind);

export const pathOrNull = (file: string): FsPath | null => {
    const path = parseFsPath(file);
    return path.kind === 'ok' ? path.value : null;
};
