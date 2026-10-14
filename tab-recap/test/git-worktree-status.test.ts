import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsGitDirWatcher } from '#src/adapters/git-dir-watch.ts';
import { FULL_ARGS, FULL_TIMEOUT_MS, GitWorktreeLocator, GitWorktreeProbe, LOCATE_ARGS, TRACKED_ARGS, TRACKED_TIMEOUT_MS } from '#src/adapters/git-worktree-status.ts';
import type { Runner, RunResult } from '#src/adapters/process.ts';
import { must } from '#src/protocol/result.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import type { Directory } from '#src/recap/domain/directory.ts';

const dir = (path: string): Directory => must(parseDirectory(path));
const git = (cwd: string, ...args: string[]): string => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });
const until = async (done: () => boolean): Promise<void> => {
    for (let waited = 0; waited < 3000 && !done(); waited += 20) {
        await new Promise<void>((resolve) => { setTimeout(resolve, 20); });
    }
};
const quiet = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 150); });

function repo(): { readonly root: string; readonly clean: () => void } {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'worktree-status-')));
    git(root, 'init', '-q', '-b', 'main');
    writeFileSync(join(root, 'a.txt'), 'one\n');
    git(root, 'add', 'a.txt');
    git(root, 'commit', '-q', '-m', 'first');
    return { root, clean: (): void => { rmSync(root, { recursive: true, force: true }); } };
}

test('the git commands keep the prefix the measurement counts, ask no lock, and the tiers differ only in the untracked flag', () => {
    assert.deepEqual(TRACKED_ARGS.slice(0, 3), ['-c', 'core.fsmonitor=false', 'status']);
    assert.deepEqual(FULL_ARGS.slice(0, 3), ['-c', 'core.fsmonitor=false', 'status']);
    assert.deepEqual(TRACKED_ARGS.slice(3), ['--porcelain=v2', '--branch', '--untracked-files=no']);
    assert.deepEqual(FULL_ARGS.slice(3), ['--porcelain=v2', '--branch', '--untracked-files=normal']);
    assert.ok(LOCATE_ARGS.includes('--show-toplevel') && LOCATE_ARGS.includes('--absolute-git-dir') && LOCATE_ARGS.includes('--git-common-dir'));
});

test('the probe asks in the root with no optional lock and the timeout of its tier', async () => {
    const calls: { args: readonly string[]; cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number }[] = [];
    const runner: Runner = (_command, args, options): Promise<RunResult> => {
        calls.push({ args, cwd: options.cwd, env: options.env, timeoutMs: options.timeoutMs });
        return Promise.resolve({ code: 0, stdout: '# branch.oid abc\n# branch.head main\n', stderr: '', timedOut: false });
    };
    const probe = new GitWorktreeProbe(runner);
    await probe.read(dir('/w/repo'), 'tracked');
    await probe.read(dir('/w/repo'), 'full');
    assert.deepEqual(calls.map((call) => [call.args, call.cwd, call.timeoutMs]), [[TRACKED_ARGS, '/w/repo', TRACKED_TIMEOUT_MS], [FULL_ARGS, '/w/repo', FULL_TIMEOUT_MS]]);
    assert.equal(calls[0]?.env['GIT_OPTIONAL_LOCKS'], '0');
});

test('the probe says why it could not read: a timeout, a failed exit and an answer it cannot parse', async () => {
    const reply = (result: RunResult): GitWorktreeProbe => new GitWorktreeProbe(() => Promise.resolve(result));
    const timedOut = await reply({ code: 0, stdout: '', stderr: '', timedOut: true }).read(dir('/w/r'), 'full');
    assert.equal(timedOut.kind === 'unknown' && timedOut.why.why, 'timeout');
    const failed = await reply({ code: 128, stdout: '', stderr: 'fatal', timedOut: false }).read(dir('/w/r'), 'full');
    assert.equal(failed.kind === 'unknown' && failed.why.why, 'failed');
});

test('against a real repository: the root is found from a subfolder; the tracked tier ignores untracked files and the full tier counts them', async () => {
    const fixture = repo();
    try {
        mkdirSync(join(fixture.root, 'src'));
        writeFileSync(join(fixture.root, 'a.txt'), 'two\n');
        writeFileSync(join(fixture.root, 'new.txt'), 'x\n');
        writeFileSync(join(fixture.root, 'src', 'other.txt'), 'x\n');
        const located = await new GitWorktreeLocator().locate(dir(join(fixture.root, 'src')));
        assert.equal(located.kind, 'worktree');
        if (located.kind !== 'worktree') {
            return;
        }
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
    const fixture = repo();
    const linked = join(fixture.root, '..', `${fixture.root.split('/').pop()}-linked`);
    try {
        git(fixture.root, 'worktree', 'add', '-q', '-b', 'side', linked);
        const found = await new GitWorktreeLocator().locate(dir(linked));
        assert.equal(found.kind, 'worktree');
        if (found.kind === 'worktree') {
            assert.equal(found.worktree.root, realpathSync(linked));
            assert.equal(found.worktree.commonDir, join(fixture.root, '.git'));
            assert.match(found.worktree.gitDir, /\.git\/worktrees\/[^/]+$/);
        }
    } finally {
        rmSync(linked, { recursive: true, force: true });
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
    const fixture = repo();
    try {
        const located = await new GitWorktreeLocator().locate(dir(fixture.root));
        assert.equal(located.kind, 'worktree');
        if (located.kind !== 'worktree') {
            return;
        }
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
        git(fixture.root, 'add', 'b.txt');
        await until(() => fired > base);
        assert.ok(fired > base, 'staging writes the index');
        const staged = fired;
        git(fixture.root, 'commit', '-q', '-m', 'second');
        await until(() => fired > staged);
        assert.ok(fired > staged, 'a commit moves the branch');
        const committed = fired;
        git(fixture.root, 'switch', '-q', '-c', 'feat/x');
        await until(() => fired > committed);
        assert.ok(fired > committed, 'a switch rewrites HEAD');
        watch.close();
        await quiet();
        const closed = fired;
        git(fixture.root, 'switch', '-q', 'main');
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
