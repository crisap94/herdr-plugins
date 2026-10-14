import { watch } from 'node:fs';
import { join } from 'node:path';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import type { Directory } from '#src/recap/domain/directory.ts';
import type { WorktreeWatch } from '#src/recap/domain/worktree.ts';
import type { GitDirWatch, GitDirWatcher } from '#src/ports/worktree-status.ts';

type Accepts = 'git-dir' | 'refs';

interface Target {
    readonly dir: Directory;
    readonly accepts: Accepts;
}

const GIT_DIR_NAMES: ReadonlySet<string> = new Set(['HEAD', 'index', 'packed-refs']);
const LOCK_SUFFIX = '.lock';
const REFS = 'refs';

function below(dir: Directory, name: string): Directory | null {
    const found = parseDirectory(join(dir, name));
    return found.kind === 'ok' ? found.value : null;
}

function targetsOf(worktree: WorktreeWatch): readonly Target[] {
    const refs = below(worktree.commonDir, REFS);
    return [
        { dir: worktree.gitDir, accepts: 'git-dir' },
        ...(worktree.commonDir === worktree.gitDir ? [] : [{ dir: worktree.commonDir, accepts: 'git-dir' } satisfies Target]),
        ...(refs === null ? [] : [{ dir: refs, accepts: 'refs' } satisfies Target]),
    ];
}

function open(target: Target, changed: () => void): GitDirWatch | null {
    try {
        const watcher = watch(target.dir, { persistent: false, recursive: target.accepts === 'refs' }, (_event, name) => {
            const file = name ?? '';
            if (target.accepts === 'git-dir' ? GIT_DIR_NAMES.has(file) : !file.endsWith(LOCK_SUFFIX)) {
                changed();
            }
        });
        watcher.on('error', () => undefined);
        return { close: (): void => { watcher.close(); } };
    } catch {
        return null;
    }
}

export class FsGitDirWatcher implements GitDirWatcher {
    watch(worktree: WorktreeWatch, changed: () => void): GitDirWatch {
        const opened = targetsOf(worktree).flatMap((target) => open(target, changed) ?? []);
        return { close: (): void => { opened.forEach((one) => { one.close(); }); } };
    }
}
