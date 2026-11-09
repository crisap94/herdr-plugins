import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import { GitDeadline, layeredFs } from '#src/adapters/git/layered-fs.ts';
import { must } from '#src/protocol/result.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { WorktreeWatch } from '#src/recap/domain/worktree.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import { makeRepo, makeLinked, scratch } from './fixtures/git-repo.ts';

const far = (): ReturnType<typeof instant> => instant(Date.now() + 60_000);

function layoutOf(root: string, gitDir: string, commonDir: string): WorktreeWatch {
    return {
        root: must(parseDirectory(root)),
        gitDir: must(parseDirectory(gitDir)),
        commonDir: must(parseDirectory(commonDir)),
    };
}

test('a shared entry is read from the common directory, and the index write is a no-op', async () => {
    const main = await makeRepo('layered-main-', { 'a.txt': 'one\n' });
    try {
        const linked = await makeLinked(main.root, 'wt');
        const layout = layoutOf(linked, join(main.root, '.git', 'worktrees', 'wt'), join(main.root, '.git'));
        const fs = layeredFs(fsp, layout, far());
        const config = await fs.promises.readFile(join(layout.gitDir, 'config'), 'utf8');
        assert.match(String(config), /\[core\]/);
        await fs.promises.writeFile(join(layout.gitDir, 'index'), Buffer.from(''));
    } finally {
        main.clean();
    }
});

test('a write outside the index is refused with the read-only message', async () => {
    const main = await makeRepo('layered-write-', { 'a.txt': 'one\n' });
    try {
        const linked = await makeLinked(main.root, 'wt2');
        const layout = layoutOf(linked, join(main.root, '.git', 'worktrees', 'wt2'), join(main.root, '.git'));
        const fs = layeredFs(fsp, layout, far());
        await assert.rejects(fs.promises.writeFile(join(layout.gitDir, 'HEAD'), 'x'), /read-only/);
    } finally {
        main.clean();
    }
});

test('a call after the deadline fails with the deadline error', async () => {
    const box = scratch('layered-deadline-');
    try {
        const layout = layoutOf(box.root, box.root, box.root);
        const fs = layeredFs(fsp, layout, instant(Date.now() - 1));
        await assert.rejects(fs.promises.stat(box.root), GitDeadline);
    } finally {
        box.clean();
    }
});
