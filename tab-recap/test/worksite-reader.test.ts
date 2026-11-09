import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { init, resolveRef, setConfig } from 'isomorphic-git';
import { GitWorksiteReader } from '#src/adapters/git/worksite.ts';
import { makeRepo, scratch, stage, unstage } from './fixtures/git-repo.ts';

const fs = { promises: fsp };
const reader = new GitWorksiteReader();

test('a commit and a clean worktree give the commit and zero paths', async () => {
    const repo = await makeRepo('worksite-clean-', { 'a.txt': 'x\n' });
    try {
        const head = await resolveRef({ fs, dir: repo.root, ref: 'HEAD' });
        assert.deepEqual(await reader.lastCommit(repo.root), { kind: 'commit', hash: head.slice(0, 7), subject: 'first' });
        assert.deepEqual(await reader.uncommitted(repo.root), { kind: 'paths', count: 0, paths: [] });
    } finally {
        repo.clean();
    }
});

test('31 uncommitted paths keep the full count', async () => {
    const repo = await makeRepo('worksite-many-', { 'a.txt': 'x\n' });
    try {
        const names = Array.from({ length: 31 }, (_, index) => `f${String(index).padStart(2, '0')}.txt`);
        for (const name of names) {
            writeFileSync(join(repo.root, name), 'y\n');
        }
        assert.deepEqual(await reader.uncommitted(repo.root), { kind: 'paths', count: 31, paths: names });
    } finally {
        repo.clean();
    }
});

test('a repository without a commit has no last commit, but still lists its paths', async () => {
    const repo = scratch('worksite-unborn-');
    try {
        await init({ fs, dir: repo.root, defaultBranch: 'main' });
        writeFileSync(join(repo.root, 'a.txt'), 'x\n');
        assert.equal((await reader.lastCommit(repo.root)).kind, 'unknown');
        assert.deepEqual(await reader.uncommitted(repo.root), { kind: 'paths', count: 1, paths: ['a.txt'] });
    } finally {
        repo.clean();
    }
});

test('a vanished directory is not-found for both reads', async () => {
    const repo = scratch('worksite-gone-');
    try {
        const gone = join(repo.root, 'nope');
        assert.deepEqual(await reader.lastCommit(gone), { kind: 'unknown', why: { why: 'not-found', what: 'directory' } });
        assert.deepEqual(await reader.uncommitted(gone), { kind: 'unknown', why: { why: 'not-found', what: 'directory' } });
    } finally {
        repo.clean();
    }
});

test('a staged rename is listed by its new path, an untracked file is listed', async () => {
    const repo = await makeRepo('worksite-rename-', { 'a.txt': 'x\n' });
    try {
        writeFileSync(join(repo.root, 'b.txt'), 'x\n');
        rmSync(join(repo.root, 'a.txt'));
        await stage(repo.root, 'b.txt');
        await unstage(repo.root, 'a.txt');
        writeFileSync(join(repo.root, 'u.txt'), 'u\n');
        assert.deepEqual(await reader.uncommitted(repo.root), { kind: 'paths', count: 2, paths: ['b.txt', 'u.txt'] });
    } finally {
        repo.clean();
    }
});

test('a path with a space and a newline is one path', async () => {
    const repo = await makeRepo('worksite-space-', { 'a.txt': 'x\n' });
    try {
        const odd = 'with space\nnewline.txt';
        writeFileSync(join(repo.root, odd), 'z\n');
        assert.deepEqual(await reader.uncommitted(repo.root), { kind: 'paths', count: 1, paths: [odd] });
    } finally {
        repo.clean();
    }
});

test('ignored files are not counted, and a config that hides untracked files does not undercount', async () => {
    const repo = await makeRepo('worksite-ignore-', { 'a.txt': 'x\n', '.gitignore': 'ignored.log\n' });
    try {
        writeFileSync(join(repo.root, 'ignored.log'), 'i\n');
        writeFileSync(join(repo.root, 'shown.txt'), 's\n');
        await setConfig({ fs, dir: repo.root, path: 'status.showUntrackedFiles', value: 'no' });
        assert.deepEqual(await reader.uncommitted(repo.root), { kind: 'paths', count: 1, paths: ['shown.txt'] });
    } finally {
        repo.clean();
    }
});

test('the daemon environment that redirects git never reaches a read', async () => {
    const repo = await makeRepo('worksite-env-', { 'a.txt': 'x\n' });
    const saved = { dir: process.env['GIT_DIR'], work: process.env['GIT_WORK_TREE'], index: process.env['GIT_INDEX_FILE'] };
    try {
        process.env['GIT_DIR'] = '/nonexistent/elsewhere';
        process.env['GIT_WORK_TREE'] = '/nonexistent/tree';
        process.env['GIT_INDEX_FILE'] = '/nonexistent/index';
        const head = await resolveRef({ fs, dir: repo.root, ref: 'HEAD' });
        assert.deepEqual(await reader.lastCommit(repo.root), { kind: 'commit', hash: head.slice(0, 7), subject: 'first' });
        mkdirSync(join(repo.root, 'sub'));
        assert.deepEqual(await reader.uncommitted(repo.root), { kind: 'paths', count: 0, paths: [] });
    } finally {
        for (const [name, value] of [['GIT_DIR', saved.dir], ['GIT_WORK_TREE', saved.work], ['GIT_INDEX_FILE', saved.index]] as const) {
            if (value === undefined) {
                delete process.env[name];
            } else {
                process.env[name] = value;
            }
        }
        repo.clean();
    }
});
