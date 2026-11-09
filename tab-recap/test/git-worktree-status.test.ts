import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { branch, checkout, commit } from 'isomorphic-git';
import { FsGitDirWatcher } from '#src/adapters/git/dir-watch.ts';
import { GitWorktreeLocator, GitWorktreeProbe } from '#src/adapters/git/worktree-status.ts';
import { must } from '#src/protocol/result.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import type { Directory } from '#src/recap/domain/directory.ts';
import { AUTHOR, makeLinked, makeRepo, stage } from './fixtures/git-repo.ts';

const fs = { promises: fsp };
const dir = (path: string): Directory => must(parseDirectory(path));
const until = async (done: () => boolean): Promise<void> => {
    for (let waited = 0; waited < 3000 && !done(); waited += 20) {
        await new Promise<void>((resolve) => { setTimeout(resolve, 20); });
    }
};
const quiet = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 150); });

test('the probe reads the root of a repository from a subfolder: the tracked tier ignores untracked files and the full tier counts them', async () => {
    const fixture = await makeRepo('worktree-status-', { 'a.txt': 'one\n' });
    try {
        mkdirSync(join(fixture.root, 'src'));
        writeFileSync(join(fixture.root, 'a.txt'), 'two two\n');
        writeFileSync(join(fixture.root, 'new.txt'), 'x\n');
        writeFileSync(join(fixture.root, 'src', 'other.txt'), 'x\n');
        const located = await new GitWorktreeLocator().locate(dir(join(fixture.root, 'src')));
        assert.equal(located.kind, 'worktree');
        assert.deepEqual([located.worktree.root, located.worktree.gitDir, located.worktree.commonDir], [fixture.root, join(fixture.root, '.git'), join(fixture.root, '.git')]);
        const probe = new GitWorktreeProbe();
        const cheap = await probe.read(located.worktree.root, 'tracked');
        const full = await probe.read(located.worktree.root, 'full');
        assert.deepEqual(cheap.kind === 'read' && [cheap.reading.branch, cheap.reading.tracked, cheap.reading.untracked], ['main', 1, 0]);
        assert.deepEqual(full.kind === 'read' && [full.reading.tracked, full.reading.untracked], [1, 2]);
    } finally {
        fixture.clean();
    }
});

test('a linked worktree has its own git dir and shares the common one', async () => {
    const fixture = await makeRepo('worktree-linked-', { 'a.txt': 'one\n' });
    try {
        const linked = await makeLinked(fixture.root, 'side');
        const found = await new GitWorktreeLocator().locate(dir(linked));
        assert.equal(found.kind, 'worktree');
        assert.equal(found.worktree.root, linked);
        assert.equal(found.worktree.commonDir, join(fixture.root, '.git'));
        assert.match(found.worktree.gitDir, /\.git\/worktrees\/[^/]+$/);
    } finally {
        fixture.clean();
    }
});

test('outside a repository the locator says so', async () => {
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'worktree-outside-')));
    try {
        assert.deepEqual(await new GitWorktreeLocator().locate(dir(outside)), { kind: 'no-repo' });
    } finally {
        rmSync(outside, { recursive: true, force: true });
    }
});

test('the watcher fires for a stage, a commit and a branch switch, not for a lock file or FETCH_HEAD, and not after close', async () => {
    const fixture = await makeRepo('worktree-watch-', { 'a.txt': 'one\n' });
    try {
        const located = await new GitWorktreeLocator().locate(dir(fixture.root));
        assert.equal(located.kind, 'worktree');
        let fired = 0;
        const watch = new FsGitDirWatcher().watch(located.worktree, () => { fired += 1; });
        await quiet();
        const base = fired;
        writeFileSync(join(fixture.root, '.git', 'index.lock'), '');
        writeFileSync(join(fixture.root, '.git', 'FETCH_HEAD'), '');
        await quiet();
        rmSync(join(fixture.root, '.git', 'index.lock'));
        await quiet();
        assert.equal(fired, base, 'a lock file and FETCH_HEAD are not changes');
        writeFileSync(join(fixture.root, 'b.txt'), 'b\n');
        await stage(fixture.root, 'b.txt');
        await until(() => fired > base);
        assert.ok(fired > base, 'staging writes the index');
        const staged = fired;
        await commit({ fs, dir: fixture.root, message: 'second', author: AUTHOR });
        await until(() => fired > staged);
        assert.ok(fired > staged, 'a commit moves the branch');
        const committed = fired;
        await branch({ fs, dir: fixture.root, ref: 'feat/x', checkout: true });
        await until(() => fired > committed);
        assert.ok(fired > committed, 'a switch rewrites HEAD');
        watch.close();
        await quiet();
        const closed = fired;
        await checkout({ fs, dir: fixture.root, ref: 'main' });
        await quiet();
        assert.equal(fired, closed);
    } finally {
        fixture.clean();
    }
});

test('watching a worktree that is gone is not an error', () => {
    const watch = new FsGitDirWatcher().watch({ root: dir('/nowhere/r'), gitDir: dir('/nowhere/r/.git'), commonDir: dir('/nowhere/r/.git') }, () => undefined);
    watch.close();
});
