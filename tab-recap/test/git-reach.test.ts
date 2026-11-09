import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { setConfig, addRemote } from 'isomorphic-git';
import { handleOf, openRepo, unreadable, withinBudget } from '#src/adapters/git/reach.ts';
import { aheadOf, branchOf, headLabelOf, lastCommitOf, originWebOf } from '#src/adapters/git/reach-history.ts';
import { changesOf } from '#src/adapters/git/reach-status.ts';
import { must } from '#src/protocol/result.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import type { Directory } from '#src/recap/domain/directory.ts';
import { duration, instant } from '#src/recap/domain/time.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { makeLinked, makeRepo, scratch, slowDisk, stage, stuckDisk, unstage } from './fixtures/git-repo.ts';

const far = (): Instant => instant(Date.now() + 60_000);
const dir = (path: string): Directory => must(parseDirectory(path));

test('a plain directory is not a repository, and a missing one is not either', async () => {
    const plain = scratch('reach-plain-');
    try {
        assert.deepEqual(await openRepo(dir(plain.root), fsp), { kind: 'no-repo' });
        assert.deepEqual(await openRepo(dir(join(plain.root, 'nope')), fsp), { kind: 'no-repo' });
    } finally {
        plain.clean();
    }
});

test('a linked worktree reads the common directory for its shared entries', async () => {
    const main = await makeRepo('reach-linked-', { 'a.txt': 'x\n' });
    try {
        const linked = await makeLinked(main.root, 'side');
        const found = await openRepo(dir(linked), fsp);
        assert.equal(found.kind, 'worktree');
        assert.equal(found.worktree.commonDir, dir(join(main.root, '.git')));
        assert.equal(found.worktree.gitDir, dir(join(main.root, '.git', 'worktrees', 'side')));
    } finally {
        main.clean();
    }
});

test('the status reads a clean tree, a modified file, a collapsed untracked directory, and a rename once', async () => {
    const repo = await makeRepo('reach-status-', { 'a.txt': 'one\n', 'keep/b.txt': 'two\n' });
    try {
        const found = await openRepo(dir(repo.root), fsp);
        assert.equal(found.kind, 'worktree');
        const handle = handleOf(found.worktree, far(), fsp);
        const clean = must(await changesOf(handle));
        assert.deepEqual(clean, { tracked: [], untracked: [] });

        writeFileSync(join(repo.root, 'a.txt'), 'changed\n');
        mkdirSync(join(repo.root, 'fresh'));
        writeFileSync(join(repo.root, 'fresh', 'x.txt'), 'x\n');
        const modified = must(await changesOf(handle));
        assert.deepEqual(modified.tracked, ['a.txt']);
        assert.deepEqual(modified.untracked, ['fresh/']);

        writeFileSync(join(repo.root, 'a.txt'), 'one\n');
        rmSync(join(repo.root, 'fresh'), { recursive: true });
        rmSync(join(repo.root, 'a.txt'));
        await unstage(repo.root, 'a.txt');
        writeFileSync(join(repo.root, 'moved.txt'), 'one\n');
        await stage(repo.root, 'moved.txt');
        const renamed = must(await changesOf(handle));
        assert.deepEqual(renamed.tracked, ['moved.txt']);
    } finally {
        repo.clean();
    }
});

test('the branch, the head label, the last commit, the ahead count and the origin web read from config and refs', async () => {
    const repo = await makeRepo('reach-history-', { 'a.txt': 'one\n' });
    try {
        const found = await openRepo(dir(repo.root), fsp);
        assert.equal(found.kind, 'worktree');
        const handle = handleOf(found.worktree, far(), fsp);
        assert.equal(must(await branchOf(handle)), 'main');
        assert.equal(must(await headLabelOf(handle)), 'main');
        const last = await lastCommitOf(handle);
        if (last === null) {
            assert.fail('a commit is expected');
        }
        assert.equal(last.subject, 'first');
        assert.equal(last.hash.length, 7);
        assert.equal(must(await aheadOf(handle, must(parseText('main')))), null);
        assert.equal(await originWebOf(handle), null);

        await setConfig({ fs: fsp, dir: repo.root, path: 'branch.main.remote', value: '.' });
        await setConfig({ fs: fsp, dir: repo.root, path: 'branch.main.merge', value: 'refs/heads/main' });
        assert.equal(must(await aheadOf(handle, must(parseText('main')))), 0);
        await addRemote({ fs: fsp, dir: repo.root, remote: 'origin', url: 'https://gitlab.com/acme/tool.git' });
        assert.notEqual(await originWebOf(handle), null);
        await stage(repo.root, 'a.txt');
    } finally {
        repo.clean();
    }
});

test('a read that outlives its budget is a timeout, a read on a stuck disk is a timeout too', async () => {
    const repo = await makeRepo('reach-budget-', { 'a.txt': 'one\n' });
    try {
        const stuck = await withinBudget(duration(50), async (deadline) => {
            const handle = handleOf({ root: dir(repo.root), gitDir: dir(join(repo.root, '.git')), commonDir: dir(join(repo.root, '.git')) }, deadline, stuckDisk(fsp));
            return changesOf(handle);
        });
        assert.deepEqual(stuck, { kind: 'unknown', why: { why: 'timeout', after: duration(50) } });
        const slow = await withinBudget(duration(30), async (deadline) => {
            const handle = handleOf({ root: dir(repo.root), gitDir: dir(join(repo.root, '.git')), commonDir: dir(join(repo.root, '.git')) }, deadline, slowDisk(fsp, 100));
            return changesOf(handle);
        });
        assert.equal((slow as { kind?: string }).kind, 'unknown');
        assert.deepEqual(unreadable({ kind: 'not-a-row' }), { kind: 'unknown', why: { why: 'unreadable', detail: 'not-a-row' } });
    } finally {
        repo.clean();
    }
});
