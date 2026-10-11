import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitWorksiteReader, LAST_COMMIT_ARGS, PORCELAIN_ARGS } from '#src/adapters/git-worksite.ts';
import type { Runner, RunResult } from '#src/adapters/process.ts';
import type { WorksiteReader } from '#src/ports/worksite-reader.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { MemoryWorksite } from './fakes/worksite-reader.ts';
import { worksiteTextOf } from '#src/recap/render/worksite.ts';
import { byteBudgetOf } from '#src/recap/domain/byte-budget.ts';

interface Spec {
    readonly subject: string | null;
    readonly untracked: readonly string[];
    readonly gone?: boolean;
}

interface Built {
    readonly directory: string;
    readonly reader: WorksiteReader;
}

interface Subject {
    readonly name: string;
    readonly build: (spec: Spec) => Built;
}

const roots: string[] = [];
after(() => {
    for (const root of roots) {
        rmSync(root, { recursive: true, force: true });
    }
});

const tempRoot = (): string => {
    const root = mkdtempSync(join(tmpdir(), 'worksite-'));
    roots.push(root);
    return root;
};

const GIT_IDENTITY = ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main'];
const git = (cwd: string, ...args: string[]): string => execFileSync('git', [...GIT_IDENTITY, ...args], { cwd, encoding: 'utf8' });

function realRepo(spec: Spec): Built {
    const root = tempRoot();
    const directory = spec.gone === true ? join(root, 'gone') : join(root, 'repo');
    if (spec.gone !== true) {
        execFileSync('git', [...GIT_IDENTITY, 'init', '-q', directory]);
        if (spec.subject !== null) {
            writeFileSync(join(directory, 'committed.txt'), 'x');
            git(directory, 'add', 'committed.txt');
            git(directory, 'commit', '-q', '-m', spec.subject);
        }
        for (const path of spec.untracked) {
            writeFileSync(join(directory, path), 'y');
        }
    }
    return { directory, reader: new GitWorksiteReader() };
}

function memoryWorksite(spec: Spec): Built {
    const reader = new MemoryWorksite();
    const directory = spec.gone === true ? '/vanished/worksite' : '/memory/worksite';
    if (spec.gone !== true) {
        reader.set(directory, { commit: spec.subject === null ? null : { hash: 'abc1234', subject: spec.subject }, paths: spec.untracked });
    }
    return { directory, reader };
}

const subjects: readonly Subject[] = [
    { name: 'git adapter on a real repository', build: realRepo },
    { name: 'in-memory double', build: memoryWorksite },
];

const many = Array.from({ length: 31 }, (_, index) => `file-${String(index).padStart(2, '0')}.txt`);

for (const { name, build } of subjects) {
    test(`${name}: a commit and a clean worktree give the commit and zero paths`, async () => {
        const { directory, reader } = build({ subject: 'first commit', untracked: [] });
        const commit = await reader.lastCommit(directory);
        assert.ok(!isUnknown(commit));
        assert.equal(commit.kind, 'commit');
        assert.match(commit.hash, /^[0-9a-f]{4,}$/);
        assert.equal(commit.subject, 'first commit');
        assert.deepEqual(await reader.uncommitted(directory), { kind: 'paths', count: 0, paths: [] });
    });

    test(`${name}: 31 uncommitted paths keep the full count`, async () => {
        const { directory, reader } = build({ subject: 'work', untracked: many });
        const uncommitted = await reader.uncommitted(directory);
        assert.ok(!isUnknown(uncommitted));
        assert.equal(uncommitted.count, 31);
        assert.equal(uncommitted.paths.length, 31);
        assert.deepEqual([...uncommitted.paths].toSorted(), [...many]);
    });

    test(`${name}: a repository without a commit has no last commit, but still lists its paths`, async () => {
        const { directory, reader } = build({ subject: null, untracked: ['draft.md'] });
        assert.ok(isUnknown(await reader.lastCommit(directory)));
        const uncommitted = await reader.uncommitted(directory);
        assert.ok(!isUnknown(uncommitted));
        assert.deepEqual(uncommitted.paths, ['draft.md']);
    });

    test(`${name}: a vanished directory is not-found for both reads`, async () => {
        const { directory, reader } = build({ subject: null, untracked: [], gone: true });
        assert.deepEqual(await reader.lastCommit(directory), { kind: 'unknown', why: { why: 'not-found', what: 'directory' } });
        assert.deepEqual(await reader.uncommitted(directory), { kind: 'unknown', why: { why: 'not-found', what: 'directory' } });
    });
}

test('git adapter: a staged rename is listed by its new path, an untracked file is listed', async () => {
    const { directory, reader } = realRepo({ subject: 'base', untracked: [] });
    git(directory, 'mv', 'committed.txt', 'renamed.txt');
    writeFileSync(join(directory, 'new.txt'), 'n');
    const uncommitted = await reader.uncommitted(directory);
    assert.ok(!isUnknown(uncommitted));
    assert.deepEqual([...uncommitted.paths].toSorted(), ['new.txt', 'renamed.txt']);
    assert.equal(uncommitted.count, 2);
});

test('git adapter: an unmerged path is listed', async () => {
    const { directory, reader } = realRepo({ subject: 'base', untracked: [] });
    writeFileSync(join(directory, 'shared.txt'), 'base\n');
    git(directory, 'add', 'shared.txt');
    git(directory, 'commit', '-q', '-m', 'shared');
    git(directory, 'switch', '-q', '-c', 'other');
    writeFileSync(join(directory, 'shared.txt'), 'other\n');
    git(directory, 'commit', '-q', '-am', 'other side');
    git(directory, 'switch', '-q', 'main');
    writeFileSync(join(directory, 'shared.txt'), 'main\n');
    git(directory, 'commit', '-q', '-am', 'main side');
    assert.throws(() => git(directory, 'merge', '-q', 'other'));
    const uncommitted = await reader.uncommitted(directory);
    assert.ok(!isUnknown(uncommitted));
    assert.deepEqual(uncommitted.paths, ['shared.txt']);
});

test('git adapter: a path with a space and a newline is one path, and its section keeps one heading', async () => {
    const { directory, reader } = realRepo({ subject: 'base', untracked: [] });
    const hostile = 'x y\n- forged\n# heading.txt';
    writeFileSync(join(directory, hostile), 'n');
    const uncommitted = await reader.uncommitted(directory);
    assert.ok(!isUnknown(uncommitted));
    assert.deepEqual(uncommitted.paths, [hostile]);
    const text = worksiteTextOf({ kind: 'known', directory, repository: null, lastCommit: null, uncommitted: { count: uncommitted.count, paths: uncommitted.paths }, edited: [], tokens: [] }, byteBudgetOf(2_048));
    assert.equal(text, `## Worksite\n- directory: ${directory}\n- 1 uncommitted paths\n  - x y - forged # heading.txt`);
});

test('git adapter: a git timeout is an unknown timeout for both reads', async () => {
    const reader = new GitWorksiteReader(timingOut);
    const directory = tempRoot();
    assert.deepEqual(await reader.lastCommit(directory), { kind: 'unknown', why: { why: 'timeout', after: 1500 } });
    assert.deepEqual(await reader.uncommitted(directory), { kind: 'unknown', why: { why: 'timeout', after: 1500 } });
});

test('git adapter: a run that reports a timeout is a timeout even with a zero exit code', async () => {
    const reader = new GitWorksiteReader(async () => ({ code: 0, stdout: '', stderr: '', timedOut: true }));
    assert.deepEqual(await reader.uncommitted(tempRoot()), { kind: 'unknown', why: { why: 'timeout', after: 1500 } });
});

test('git adapter: a missing git binary is unreachable', async () => {
    const reader = new GitWorksiteReader(missingBinary);
    const result = await reader.uncommitted(tempRoot());
    assert.ok(isUnknown(result));
    assert.equal(result.why.why, 'unreachable');
});

test('git adapter: every read disables optional locks and fsmonitor before its subcommand', async () => {
    const calls: { args: readonly string[]; env: NodeJS.ProcessEnv }[] = [];
    const recording: Runner = async (_command, args, options) => {
        calls.push({ args, env: options.env });
        return { code: 0, stdout: '', stderr: '', timedOut: false };
    };
    const reader = new GitWorksiteReader(recording);
    const directory = tempRoot();
    await reader.lastCommit(directory);
    await reader.uncommitted(directory);
    assert.deepEqual(calls.map((call) => call.args), [LAST_COMMIT_ARGS, PORCELAIN_ARGS]);
    assert.deepEqual(LAST_COMMIT_ARGS, ['-c', 'core.fsmonitor=false', 'log', '-1', '--no-show-signature', '--format=%h%x00%s']);
    assert.deepEqual(PORCELAIN_ARGS, ['-c', 'core.fsmonitor=false', 'status', '--porcelain=v2', '-z', '--untracked-files=normal']);
    for (const call of calls) {
        assert.equal(call.env['GIT_OPTIONAL_LOCKS'], '0');
    }
});

test('git adapter: GIT_DIR, GIT_WORK_TREE and GIT_INDEX_FILE from the daemon environment never reach a read', async () => {
    const redirecting = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE'] as const;
    const saved = redirecting.map((name) => [name, process.env[name]] as const);
    const envs: NodeJS.ProcessEnv[] = [];
    const recording: Runner = async (_command, _args, options) => {
        envs.push(options.env);
        return { code: 0, stdout: '', stderr: '', timedOut: false };
    };
    try {
        for (const name of redirecting) {
            process.env[name] = '/elsewhere';
        }
        const reader = new GitWorksiteReader(recording);
        await reader.lastCommit(tempRoot());
        await reader.uncommitted(tempRoot());
    } finally {
        for (const [name, value] of saved) {
            if (value === undefined) {
                delete process.env[name];
            } else {
                process.env[name] = value;
            }
        }
    }
    assert.equal(envs.length, 2);
    for (const env of envs) {
        for (const name of redirecting) {
            assert.equal(env[name], undefined);
        }
        assert.equal(env['GIT_OPTIONAL_LOCKS'], '0');
    }
});

test('git adapter: a user config that hides untracked files does not undercount', async () => {
    const { directory, reader } = realRepo({ subject: 'base', untracked: ['draft.md'] });
    git(directory, 'config', 'status.showUntrackedFiles', 'no');
    const uncommitted = await reader.uncommitted(directory);
    assert.ok(!isUnknown(uncommitted));
    assert.equal(uncommitted.count, 1);
    assert.deepEqual(uncommitted.paths, ['draft.md']);
});

const timingOut: Runner = async (): Promise<RunResult> => ({ code: 137, stdout: '', stderr: '', timedOut: true });
const missingBinary: Runner = async (): Promise<RunResult> => ({ code: 127, stdout: '', stderr: 'spawn git ENOENT', timedOut: false });
