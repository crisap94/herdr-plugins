import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';
import { bunHost } from '#src/host/bun-host.mjs';
import type { HarnessDirectory, HarnessList } from '#src/ports/harnesses.ts';
import { must } from '#src/protocol/result.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import { parseFsPath, type FsPath } from '#src/recap/domain/fs-path.ts';
import { parseAgentKind, type HarnessKind } from '#src/recap/domain/ids.ts';
import { AUTO_ORDER } from '#src/recap/domain/backend.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';

export const AUTO_PATH_KINDS: readonly HarnessKind[] = AUTO_ORDER.map((id) => must(parseAgentKind(id)));

export function dirsOf(path: Text): readonly FsPath[] {
    return path.split(delimiter).flatMap((dir) => {
        const parsed = parseFsPath(dir === '' ? '.' : dir);
        return parsed.kind === 'ok' ? [parsed.value] : [];
    });
}

export function presenceOnPath(command: HarnessKind, dirs: readonly FsPath[]): Presence {
    const found = dirs.some((dir) => {
        try {
            accessSync(join(dir, command), constants.X_OK);
            return true;
        } catch {
            return false;
        }
    });
    return found ? 'present' : 'absent';
}

export class PathHarnessDirectory implements HarnessDirectory {
    private readonly ids: readonly HarnessKind[];

    constructor(ids: readonly HarnessKind[]) {
        this.ids = ids;
    }

    available(): Promise<HarnessList> {
        const dirs = dirsOf(must(parseText(bunHost().path)));
        return Promise.resolve({ kind: 'available', ids: this.ids.filter((id) => presenceOnPath(id, dirs) === 'present') });
    }
}
