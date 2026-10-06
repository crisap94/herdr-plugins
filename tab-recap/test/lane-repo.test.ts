import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BRANCH_ARGS, GitLaneRepo, ORIGIN_ARGS, ROOT_ARGS } from '#src/adapters/git-lane-repo.ts';
import { run } from '#src/adapters/run.ts';
import type { Runner, RunResult } from '#src/adapters/run.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { Instant } from '#src/recap/domain/time.ts';

const ok = (stdout: string): RunResult => ({ code: 0, stdout, stderr: '', timedOut: false });
const fail = (code: number, stderr = ''): RunResult => ({ code, stdout: '', stderr, timedOut: false });

interface Call { args: readonly string[]; cwd: string; env: NodeJS.ProcessEnv }

function harness(answer: (args: readonly string[]) => RunResult): { calls: Call[]; repo: GitLaneRepo; advance: (ms: number) => void } {
    const calls: Call[] = [];
    const runner: Runner = (_command, args, options): Promise<RunResult> => {
        calls.push({ args, cwd: options.cwd, env: options.env });
        return Promise.resolve(answer(args));
    };
    let now = 0;
    const repo = new GitLaneRepo({ now: (): Instant => instant(now) }, runner, 1000);
    return { calls, repo, advance: (ms: number): void => { now += ms; } };
}

function inRepo(args: readonly string[]): RunResult {
    if (args === ROOT_ARGS) {
        return ok('/w/repo\n');
    }
    return args === ORIGIN_ARGS ? fail(2, 'error: No such remote') : ok('feat/x\n');
}

test('a repository: its top level and branch, asked with no optional locks and no fsmonitor', async () => {
    const { repo, calls } = harness(inRepo);
    assert.deepEqual(await repo.repoOf('/w/repo/sub'), { kind: 'repo', root: '/w/repo', branch: 'feat/x', web: null });
    assert.deepEqual(calls.map((call) => call.args), [ROOT_ARGS, BRANCH_ARGS, ORIGIN_ARGS]);
    for (const call of calls) {
        assert.equal(call.cwd, '/w/repo/sub');
        assert.equal(call.env['GIT_OPTIONAL_LOCKS'], '0');
        assert.deepEqual(call.args.slice(0, 2), ['-c', 'core.fsmonitor=false']);
    }
});

const REMOTES: readonly (readonly [string, string, string])[] = [
    ['git@github.com:acme/shop.git', 'https://github.com/acme/shop', 'github'],
    ['git@gitlab.example:group/sub/shop.git', 'https://gitlab.example/group/sub/shop', 'gitlab'],
    ['ssh://git@gitlab.example:2222/acme/shop.git', 'https://gitlab.example/acme/shop', 'gitlab'],
    ['https://github.com/acme/shop.git', 'https://github.com/acme/shop', 'github'],
    ['https://gitlab.example:8443/acme/shop', 'https://gitlab.example:8443/acme/shop', 'gitlab'],
    ['https://user:secret@gitlab.example/acme/shop.git', 'https://gitlab.example/acme/shop', 'gitlab'],
    ['https://oauth2:glpat-abc@github.com/acme/shop.git\n', 'https://github.com/acme/shop', 'github'],
];

test('the origin remote becomes the web base: ssh → https, .git dropped, github.com is GitHub, any other host GitLab', async () => {
    for (const [remote, base, forge] of REMOTES) {
        const { repo } = harness((args) => (args === ORIGIN_ARGS ? ok(remote) : inRepo(args)));
        assert.deepEqual(await repo.repoOf('/w'), { kind: 'repo', root: '/w/repo', branch: 'feat/x', web: { base, forge } }, remote);
    }
});

test('a remote\'s credentials are never part of the answer', async () => {
    const { repo } = harness((args) => (args === ORIGIN_ARGS ? ok('https://user:secret@gitlab.example/acme/shop.git') : inRepo(args)));
    assert.equal(JSON.stringify(await repo.repoOf('/w')).includes('secret'), false);
    assert.equal(JSON.stringify(await repo.repoOf('/w')).includes('user'), false);
});

test('no origin, a local path or a timed-out remote lookup: a repo with no web base', async () => {
    for (const answer of [fail(2, 'no such remote'), ok('/srv/git/shop.git\n'), ok(''), ok('file:///srv/git/shop.git'), { code: 0, stdout: '', stderr: '', timedOut: true }]) {
        const { repo } = harness((args) => (args === ORIGIN_ARGS ? answer : inRepo(args)));
        assert.deepEqual(await repo.repoOf('/w'), { kind: 'repo', root: '/w/repo', branch: 'feat/x', web: null });
    }
});

test('a detached HEAD has no branch; outside a repository there is no repo', async () => {
    const detached = harness((args) => (args === ROOT_ARGS ? ok('/w/r\n') : fail(1)));
    assert.deepEqual(await detached.repo.repoOf('/w/r'), { kind: 'repo', root: '/w/r', branch: null, web: null });
    const outside = harness(() => fail(128, 'fatal: not a git repository'));
    assert.deepEqual(await outside.repo.repoOf('/tmp'), { kind: 'no-repo' });
});

test('failures are sum-typed, never thrown, and never cached', async () => {
    let answer: RunResult = { code: 0, stdout: '', stderr: '', timedOut: true };
    const { repo, calls } = harness(() => answer);
    assert.deepEqual(await repo.repoOf('/w'), { kind: 'unknown', why: { why: 'timeout', after: 1500 } });
    answer = fail(127, 'spawn git ENOENT');
    assert.equal((await repo.repoOf('/w')).kind, 'unknown');
    answer = fail(2, 'boom');
    assert.deepEqual(await repo.repoOf('/w'), { kind: 'unknown', why: { why: 'failed', code: 2, detail: 'boom' } });
    assert.equal(calls.length, 9, 'each unknown answer was asked again');
});

test('cached per cwd until the TTL runs out; concurrent askers share one lookup', async () => {
    const { repo, calls, advance } = harness(inRepo);
    await Promise.all([repo.repoOf('/a'), repo.repoOf('/a')]);
    assert.equal(calls.length, 3);
    await repo.repoOf('/a');
    assert.equal(calls.length, 3, 'cached');
    await repo.repoOf('/b');
    assert.equal(calls.length, 6, 'another cwd is another entry');
    advance(1000);
    await repo.repoOf('/a');
    assert.equal(calls.length, 9, 'expired');
});

test('against real git: a repository on a branch, a subdirectory, and a directory outside any', async (): Promise<void> => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'lane-repo-')));
    try {
        execFileSync('git', ['init', '-q', '-b', 'trunk', dir]);
        mkdirSync(join(dir, 'sub'));
        const repo = new GitLaneRepo({ now: (): Instant => instant(Date.now()) }, run);
        assert.deepEqual(await repo.repoOf(join(dir, 'sub')), { kind: 'repo', root: dir, branch: 'trunk', web: null });
        execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', 'git@gitlab.example:acme/shop.git']);
        const later = new GitLaneRepo({ now: (): Instant => instant(Date.now()) }, run);
        assert.deepEqual(await later.repoOf(dir), { kind: 'repo', root: dir, branch: 'trunk', web: { base: 'https://gitlab.example/acme/shop', forge: 'gitlab' } });
        const outside = mkdtempSync(join(tmpdir(), 'lane-none-'));
        try {
            const result = await repo.repoOf(outside);
            assert.deepEqual(result, { kind: 'no-repo' });
        } finally {
            rmSync(outside, { recursive: true, force: true });
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
