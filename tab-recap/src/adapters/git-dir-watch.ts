import { watch } from 'node:fs/promises';
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

function refsOf(commonDir: Directory): Directory | null {
    const found = parseDirectory(join(commonDir, 'refs'));
    return found.kind === 'ok' ? found.value : null;
}

function targetsOf(worktree: WorktreeWatch): readonly Target[] {
    const refs = refsOf(worktree.commonDir);
    return [
        { dir: worktree.gitDir, accepts: 'git-dir' },
        ...(worktree.commonDir === worktree.gitDir ? [] : [{ dir: worktree.commonDir, accepts: 'git-dir' } satisfies Target]),
        ...(refs === null ? [] : [{ dir: refs, accepts: 'refs' } satisfies Target]),
    ];
}

async function follow(target: Target, changed: () => void, stop: AbortSignal): Promise<void> {
    try {
        for await (const event of watch(target.dir, { persistent: false, recursive: target.accepts === 'refs', signal: stop })) {
            const file = event.filename ?? '';
            if (target.accepts === 'git-dir' ? GIT_DIR_NAMES.has(file) : !file.endsWith(LOCK_SUFFIX)) {
                changed();
            }
        }
    } catch {
        return;
    }
}

export class FsGitDirWatcher implements GitDirWatcher {
    watch(worktree: WorktreeWatch, changed: () => void): GitDirWatch {
        const stop = new AbortController();
        targetsOf(worktree).forEach((target) => { void follow(target, changed, stop.signal); });
        return { close: (): void => { stop.abort(); } };
    }
}
