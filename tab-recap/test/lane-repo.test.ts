import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { addRemote, init, resolveRef } from 'isomorphic-git';
import { GitLaneRepo } from '#src/adapters/git/lane-repo.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { makeRepo, scratch } from './fixtures/git-repo.ts';

const fs = { promises: fsp };
const clockAt = (ms: number): { now: () => Instant } => ({ now: (): Instant => instant(ms) });

test('a repository: its top level and branch, from the top and from a subfolder', async () => {
    const repo = await makeRepo('lane-repo-', { 'src/a.ts': 'x\n' });
    try {
        const repos = new GitLaneRepo(clockAt(0));
        assert.deepEqual(await repos.repoOf(repo.root), { kind: 'repo', root: repo.root, branch: 'main', web: null });
        assert.deepEqual(await repos.repoOf(join(repo.root, 'src')), { kind: 'repo', root: repo.root, branch: 'main', web: null });
    } finally {
        repo.clean();
    }
});

test('the origin remote becomes the web base: ssh becomes https, .git is dropped, github.com is GitHub, any other host GitLab', async () => {
    const github = await makeRepo('lane-github-', { 'a.txt': 'x\n' });
    const gitlab = await makeRepo('lane-gitlab-', { 'a.txt': 'x\n' });
    try {
        await addRemote({ fs, dir: github.root, remote: 'origin', url: 'git@github.com:acme/shop.git' });
        await addRemote({ fs, dir: gitlab.root, remote: 'origin', url: 'ssh://git@gitlab.example:2222/acme/shop.git' });
        const repos = new GitLaneRepo(clockAt(0));
        assert.deepEqual(await repos.repoOf(github.root), { kind: 'repo', root: github.root, branch: 'main', web: { base: 'https://github.com/acme/shop', forge: 'github' } });
        assert.deepEqual(await repos.repoOf(gitlab.root), { kind: 'repo', root: gitlab.root, branch: 'main', web: { base: 'https://gitlab.example/acme/shop', forge: 'gitlab' } });
    } finally {
        github.clean();
        gitlab.clean();
    }
});

test('a remote\'s credentials are never part of the answer', async () => {
    const repo = await makeRepo('lane-token-', { 'a.txt': 'x\n' });
    try {
        await addRemote({ fs, dir: repo.root, remote: 'origin', url: 'https://oauth2:s3cr3t-token@gitlab.example/acme/shop.git' });
        const answer = JSON.stringify(await new GitLaneRepo(clockAt(0)).repoOf(repo.root));
        assert.ok(answer.includes('gitlab.example/acme/shop') && !answer.includes('s3cr3t') && !answer.includes('oauth2'), answer);
    } finally {
        repo.clean();
    }
});

test('no origin, or a local path as origin: a repo with no web base', async () => {
    const plain = await makeRepo('lane-noorigin-', { 'a.txt': 'x\n' });
    const local = await makeRepo('lane-local-', { 'a.txt': 'x\n' });
    try {
        await addRemote({ fs, dir: local.root, remote: 'origin', url: '/srv/git/shop.git' });
        const repos = new GitLaneRepo(clockAt(0));
        assert.deepEqual(await repos.repoOf(plain.root), { kind: 'repo', root: plain.root, branch: 'main', web: null });
        assert.deepEqual(await repos.repoOf(local.root), { kind: 'repo', root: local.root, branch: 'main', web: null });
    } finally {
        plain.clean();
        local.clean();
    }
});

test('a detached HEAD has no branch; outside a repository there is no repo', async () => {
    const repo = await makeRepo('lane-detached-', { 'a.txt': 'x\n' });
    const outside = scratch('lane-outside-');
    try {
        const head = await resolveRef({ fs, dir: repo.root, ref: 'HEAD' });
        writeFileSync(join(repo.root, '.git', 'HEAD'), `${head}\n`);
        const repos = new GitLaneRepo(clockAt(0));
        assert.deepEqual(await repos.repoOf(repo.root), { kind: 'repo', root: repo.root, branch: null, web: null });
        assert.deepEqual(await repos.repoOf(outside.root), { kind: 'no-repo' });
        assert.deepEqual(await repos.repoOf(join(outside.root, 'missing')), { kind: 'no-repo' });
    } finally {
        repo.clean();
        outside.clean();
    }
});

test('a broken pointer is an unknown answer, never thrown and never cached: once repaired the next ask is a repo', async () => {
    const broken = scratch('lane-broken-');
    try {
        writeFileSync(join(broken.root, '.git'), 'gitdir: /nonexistent/place/.git\n');
        const repos = new GitLaneRepo(clockAt(0));
        assert.equal((await repos.repoOf(broken.root)).kind, 'unknown');
        rmSync(join(broken.root, '.git'));
        await init({ fs, dir: broken.root, defaultBranch: 'main' });
        assert.deepEqual(await repos.repoOf(broken.root), { kind: 'repo', root: broken.root, branch: 'main', web: null });
    } finally {
        broken.clean();
    }
});

test('cached per cwd until the TTL runs out; concurrent askers share one lookup', async () => {
    const repo = await makeRepo('lane-cache-', { 'a.txt': 'x\n' });
    try {
        let now = 0;
        const repos = new GitLaneRepo({ now: (): Instant => instant(now) }, 1000);
        const [first, second] = await Promise.all([repos.repoOf(repo.root), repos.repoOf(repo.root)]);
        assert.equal(first, second);
        writeFileSync(join(repo.root, '.git', 'HEAD'), 'ref: refs/heads/other\n');
        assert.deepEqual(await repos.repoOf(repo.root), first, 'inside the TTL the answer is the cached one');
        now = 1000;
        assert.deepEqual(await repos.repoOf(repo.root), { kind: 'repo', root: repo.root, branch: 'other', web: null });
    } finally {
        repo.clean();
    }
});

test('an empty or missing directory is not a repository', async () => {
    const dir = scratch('lane-file-');
    try {
        mkdirSync(join(dir.root, 'empty'));
        const repos = new GitLaneRepo(clockAt(0));
        assert.deepEqual(await repos.repoOf(join(dir.root, 'empty')), { kind: 'no-repo' });
        assert.deepEqual(await repos.repoOf(join(dir.root, 'gone')), { kind: 'no-repo' });
    } finally {
        dir.clean();
    }
});
