import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitLaneRepo } from '#src/adapters/git-lane-repo.ts';
import { run } from '#src/adapters/run.ts';
import type { Runner, RunResult } from '#src/adapters/run.ts';
import { createGitNote, noteOf, parseStatus, STATUS_ARGS, TIMEOUT_MS } from '#src/extensions/git-note.ts';
import { FACTORIES } from '#src/extensions/index.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { Extension, NotesResult } from '#src/ports/extension.ts';
import type { LaneRepo, RepoResult } from '#src/ports/lane-repo.ts';
import type { TabLane } from '#src/ports/recap-store.ts';

const git = (cwd: string, ...args: string[]): string => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });
const lane = (pane: string, cwd: string | null): TabLane => ({ pane, agent: 'claude', status: 'idle', title: null, cwd });
const labels = (result: NotesResult): [string, string][] =>
    result.kind === 'notes' ? [...result.byPane].map(([pane, notes]) => [pane, `${notes[0]?.mark} ${notes[0]?.label} ${notes[0]?.details.join('|')}`]) : [];
const settle = (): Promise<void> => new Promise((done) => { setTimeout(done, 20); });

const PORCELAIN = [
    '# branch.oid 0123456789abcdef', '# branch.head main', '# branch.upstream origin/main', '# branch.ab +2 -1',
    '1 .M N... 100644 100644 100644 a b src/a.ts', '2 R. N... 100644 100644 100644 a b R100 new.ts\told.ts', 'u UU N... 1 1 1 1 a b c x.ts', '? notes.txt', '! ignored.log', '',
].join('\n');

test('parseStatus: branch, unpushed (ahead), and every changed path; no upstream → ahead null; detached → short oid', () => {
    assert.deepEqual(parseStatus(PORCELAIN), { branch: 'main', ahead: 2, changed: 4 });
    assert.deepEqual(parseStatus('# branch.oid abc\n# branch.head feat/x\n'), { branch: 'feat/x', ahead: null, changed: 0 });
    assert.deepEqual(parseStatus('# branch.oid 0123456789abcdef\n# branch.head (detached)\n'), { branch: '0123456', ahead: null, changed: 0 });
});

test('noteOf: ⎇, en and es; clean and not ahead is just the branch', () => {
    const status = { branch: 'main', ahead: 2, changed: 1 };
    assert.deepEqual(noteOf(status, 'en'), { label: 'main', at: null, details: ['2 unpushed', '1 changed'], mark: '⎇' });
    assert.deepEqual(noteOf({ ...status, changed: 3 }, 'es').details, ['2 sin subir', '3 cambiados']);
    assert.deepEqual(noteOf({ ...status, changed: 1 }, 'es').details, ['2 sin subir', '1 cambiado']);
    assert.deepEqual(noteOf({ branch: 'main', ahead: 0, changed: 0 }, 'en').details, []);
});

interface Call { args: readonly string[]; cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number }

function fixture(reply: (args: readonly string[]) => RunResult, found: RepoResult = { kind: 'repo', root: '/nowhere', branch: 'main' }): {
    calls: Call[]; note: Extension; config: Map<string, string>; advance: (ms: number) => void;
} {
    const calls: Call[] = [];
    const runner: Runner = (_command, args, options): Promise<RunResult> => {
        calls.push({ args, cwd: options.cwd, env: options.env, timeoutMs: options.timeoutMs });
        return Promise.resolve(reply(args));
    };
    const repo: LaneRepo = { repoOf: (): Promise<RepoResult> => Promise.resolve(found) };
    let now = 0;
    const config = new Map<string, string>();
    const note = createGitNote({ get: (key) => config.get(key), repo, runner, clock: { now: (): Instant => instant(now) } });
    return { calls, note, config, advance: (ms: number): void => { now += ms; } };
}
const ok = (stdout: string): RunResult => ({ code: 0, stdout, stderr: '', timedOut: false });
const notes = (note: { notes?: (lanes?: readonly TabLane[], locale?: 'en' | 'es') => NotesResult }, lanes: readonly TabLane[], locale: 'en' | 'es' = 'en'): NotesResult =>
    note.notes?.(lanes, locale) ?? { kind: 'notes', byPane: new Map() };

test('status is asked with no lock and no fsmonitor, 1.5 s timeout, in the lane\'s cwd; the render only reads a cache', async () => {
    const { note, calls } = fixture(() => ok(PORCELAIN));
    assert.deepEqual(labels(notes(note, [lane('p1', '/w/repo')])), [], 'the first render answers at once, with nothing');
    await settle();
    assert.equal(calls.length, 1);
    const call = calls[0] as Call;
    assert.deepEqual(call.args, STATUS_ARGS);
    assert.deepEqual(STATUS_ARGS, ['-c', 'core.fsmonitor=false', 'status', '--porcelain=v2', '--branch']);
    assert.equal(call.env['GIT_OPTIONAL_LOCKS'], '0');
    assert.equal(call.timeoutMs, TIMEOUT_MS);
    assert.equal(call.cwd, '/w/repo');
    assert.deepEqual(labels(notes(note, [lane('p1', '/w/repo')])), [['p1', '⎇ main 2 unpushed|4 changed']]);
    assert.deepEqual(labels(notes(note, [lane('p1', '/w/repo')], 'es')), [['p1', '⎇ main 2 sin subir|4 cambiados']]);
});

test('a lane with no cwd, or outside a repository, gets no note and no git status call', async () => {
    const outside = fixture(() => ok(PORCELAIN), { kind: 'no-repo' });
    notes(outside.note, [lane('p1', '/tmp'), lane('p2', null)]);
    await settle();
    assert.equal(outside.calls.length, 0);
    assert.deepEqual(labels(notes(outside.note, [lane('p1', '/tmp')])), []);
});

test('cached for the TTL, one refresh at a time, then asked again; a failed look keeps the last status', async () => {
    let reply = ok(PORCELAIN);
    const { note, calls, advance } = fixture(() => reply);
    notes(note, [lane('p1', '/w/r')]);
    notes(note, [lane('p1', '/w/r')]);
    await settle();
    assert.equal(calls.length, 1, 'two renders before the answer share one refresh');
    notes(note, [lane('p1', '/w/r')]);
    await settle();
    assert.equal(calls.length, 1, 'cached');
    advance(5000);
    reply = { code: 128, stdout: '', stderr: 'fatal', timedOut: false };
    assert.deepEqual(labels(notes(note, [lane('p1', '/w/r')])).length, 1, 'stale is still shown while refreshing');
    await settle();
    assert.equal(calls.length, 2);
    assert.equal(labels(notes(note, [lane('p1', '/w/r')])).length, 1, 'a failed look keeps what was known');
});

test('TAB_RECAP_GIT_NOTE=off: no note and no process, read at call time', async () => {
    const { note, calls, config } = fixture(() => ok(PORCELAIN));
    config.set('TAB_RECAP_GIT_NOTE', 'off');
    notes(note, [lane('p1', '/w/r')]);
    await settle();
    assert.equal(calls.length, 0);
    config.set('TAB_RECAP_GIT_NOTE', 'on');
    notes(note, [lane('p1', '/w/r')]);
    await settle();
    assert.equal(calls.length, 1);
});

test('the HEAD or index changing invalidates the cache before the TTL', async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'git-note-')));
    try {
        execFileSync('git', ['init', '-q', dir]);
        const { note, calls } = fixture(() => ok(PORCELAIN), { kind: 'repo', root: dir, branch: 'main' });
        writeFileSync(join(dir, '.git', 'index'), 'x');
        notes(note, [lane('p1', dir)]);
        await settle();
        notes(note, [lane('p1', dir)]);
        await settle();
        assert.equal(calls.length, 1);
        utimesSync(join(dir, '.git', 'index'), new Date(), new Date(Date.now() + 60_000));
        notes(note, [lane('p1', dir)]);
        await settle();
        assert.equal(calls.length, 2);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('against real git, in a linked worktree: matches `git status`, and creates no index.lock', async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'git-note-real-')));
    try {
        git(dir, 'init', '-q', '-b', 'trunk');
        writeFileSync(join(dir, 'a'), '1');
        git(dir, 'add', 'a');
        git(dir, 'commit', '-q', '-m', 'one');
        const tree = join(dir, 'wt');
        git(dir, 'worktree', 'add', '-q', '-b', 'side', tree);
        writeFileSync(join(tree, 'a'), '2');
        writeFileSync(join(tree, 'new'), 'n');
        const clock = { now: (): Instant => instant(Date.now()) };
        const note = createGitNote({ get: () => undefined, repo: new GitLaneRepo(clock), runner: run, clock });
        notes(note, [lane('p1', tree)]);
        await settle();
        await new Promise((done) => { setTimeout(done, 300); });
        assert.deepEqual(labels(notes(note, [lane('p1', tree)])), [['p1', '⎇ side 2 changed']]);
        assert.deepEqual(git(tree, 'status', '--porcelain').trim().split('\n').length, 2);
        assert.equal(existsSync(join(dir, '.git', 'worktrees', 'wt', 'index.lock')), false);
        assert.equal(existsSync(join(dir, '.git', 'index.lock')), false);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('the registry holds the git note exactly once, wherever it sits in the list', () => {
    const ids = FACTORIES.flatMap((factory) => factory(() => undefined)?.id ?? []);
    assert.equal(ids.filter((id) => id === 'git-note').length, 1);
});
