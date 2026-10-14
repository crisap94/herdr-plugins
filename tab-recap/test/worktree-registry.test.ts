import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unknown } from '#src/ports/unknowable.ts';
import type { GitDirWatch, GitDirWatcher, StatusRead, WorktreeLocator, WorktreeLookup, WorktreeProbe, WorktreeStatusWriter } from '#src/ports/worktree-status.ts';
import { WorktreeRegistry } from '#src/recap/application/worktree-registry.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import type { Directory } from '#src/recap/domain/directory.ts';
import { paneId, tabId } from '#src/recap/domain/ids.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { PerfCounter } from '#src/recap/domain/perf.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { duration, instant } from '#src/recap/domain/time.ts';
import type { PorcelainReading } from '#src/recap/domain/porcelain.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { StatusTier, WorktreeStatus, WorktreeSwitch, WorktreeWatch } from '#src/recap/domain/worktree.ts';

const dir = (path: string): Directory => must(parseDirectory(path));
const reading = (tracked: number, untracked: number): PorcelainReading => ({ branch: must(parseText('main')), ahead: null, tracked: must(parseCount(tracked)), untracked: must(parseCount(untracked)) });
const settle = (): Promise<void> => new Promise((done) => { setTimeout(done, 25); });

const NOTHING = (): void => undefined;

function holdOpen(): { readonly gate: Promise<void>; readonly release: () => void } {
    let release = NOTHING;
    const gate = new Promise<void>((done) => { release = done; });
    return { gate, release };
}

interface Rig {
    readonly registry: WorktreeRegistry;
    readonly located: string[];
    readonly reads: string[];
    readonly watching: Map<string, { closed: boolean; fire: () => void }>;
    readonly rows: Map<string, WorktreeStatus>;
    readonly bound: Map<string, string>;
    readonly counts: Map<PerfCounter, number>;
    readonly clock: { at: number };
    readonly mode: { enabled: WorktreeSwitch; answer: StatusRead; gate: Promise<void> | null };
    readonly gone: string[];
}

const ROOTS: Readonly<Record<string, string>> = { '/w/repo/src': '/w/repo', '/w/repo': '/w/repo', '/w/other': '/w/other' };

function rig(): Rig {
    const located: string[] = [];
    const reads: string[] = [];
    const watching = new Map<string, { closed: boolean; fire: () => void }>();
    const rows = new Map<string, WorktreeStatus>();
    const bound = new Map<string, string>();
    const counts = new Map<PerfCounter, number>();
    const clock = { at: 1000 };
    const gone: string[] = [];
    const mode: Rig['mode'] = { enabled: 'on', answer: { kind: 'read', reading: reading(1, 0) }, gate: null };
    const locator: WorktreeLocator = {
        locate: (cwd): Promise<WorktreeLookup> => {
            located.push(cwd);
            const root = ROOTS[cwd];
            if (root === undefined) {
                return Promise.resolve({ kind: 'no-repo' });
            }
            const worktree: WorktreeWatch = { root: dir(root), gitDir: dir(`${root}/.git`), commonDir: dir(`${root}/.git`) };
            return Promise.resolve({ kind: 'worktree', worktree });
        },
    };
    const probe: WorktreeProbe = {
        read: async (root, tier: StatusTier): Promise<StatusRead> => {
            reads.push(`${root} ${tier}`);
            await mode.gate;
            return mode.answer;
        },
    };
    const watcher: GitDirWatcher = {
        watch: (worktree, changed): GitDirWatch => {
            const entry = { closed: false, fire: changed };
            watching.set(worktree.root, entry);
            return { close: (): void => { entry.closed = true; } };
        },
    };
    const store: WorktreeStatusWriter = {
        write: (status): void => { rows.set(status.root, status); },
        bind: (pane, root): void => { if (root === null) { bound.delete(pane); } else { bound.set(pane, root); } },
        drop: (root): void => { rows.delete(root); },
        reset: (): void => { rows.clear(); bound.clear(); },
    };
    const registry = new WorktreeRegistry({
        locator, probe, watcher, store,
        clock: { now: (): Instant => instant(clock.at) },
        perf: { bump: (counter): void => { counts.set(counter, (counts.get(counter) ?? 0) + 1); } },
        enabled: (): WorktreeSwitch => mode.enabled,
        gone: (pane): void => { gone.push(pane); },
        settle: duration(1),
        every: duration(120_000),
    });
    return { registry, located, reads, watching, rows, bound, counts, clock, mode, gone };
}

const laneAt = (pane: string, cwd: string | null, status: string, tab = 'w1:t1'): Lane => laneFrom({ paneId: pane, tabId: tab, workspaceId: 'w1', agent: 'claude', status, cwd });
const boardOf = (...lanes: Lane[]): Board => ({ ...emptyBoard(), lanes: new Map(lanes.map((lane): [PaneId, Lane] => [lane.pane, lane])) });

test('two lanes of one repository share one watch and one first read; each pane is bound to the root', async () => {
    const { registry, located, reads, watching, bound, rows } = rig();
    registry.beat(boardOf(laneAt('w1:p1', '/w/repo', 'idle'), laneAt('w1:p2', '/w/repo/src', 'idle')));
    await settle();
    assert.deepEqual(located, ['/w/repo', '/w/repo/src']);
    assert.equal(watching.size, 1);
    assert.deepEqual(reads, ['/w/repo full']);
    assert.deepEqual([...bound], [['w1:p1', '/w/repo'], ['w1:p2', '/w/repo']]);
    assert.equal(rows.get(dir('/w/repo'))?.tracked, 1);
});

test('a lane outside a repository, or with no cwd, gets no watch and no read', async () => {
    const { registry, watching, reads, bound } = rig();
    registry.beat(boardOf(laneAt('w1:p1', '/tmp', 'idle'), laneAt('w1:p2', null, 'idle')));
    await settle();
    assert.deepEqual([watching.size, reads.length, bound.size], [0, 0, 0]);
});

test('a burst of git-dir changes is one tracked read that keeps the untracked count of the last full one', async () => {
    const { registry, reads, watching, rows, mode, counts } = rig();
    mode.answer = { kind: 'read', reading: reading(2, 7) };
    registry.beat(boardOf(laneAt('w1:p1', '/w/repo', 'idle')));
    await settle();
    mode.answer = { kind: 'read', reading: reading(3, 0) };
    const change = watching.get('/w/repo')?.fire ?? ((): void => undefined);
    change();
    change();
    change();
    await settle();
    assert.deepEqual(reads, ['/w/repo full', '/w/repo tracked']);
    const status = rows.get(dir('/w/repo'));
    assert.deepEqual([status?.tracked, status?.untracked], [3, 7]);
    assert.equal(counts.get('git-dir-event'), 3);
    assert.equal(counts.get('status-coalesced'), 2);
});

test('a change during a read is read again afterwards, never at the same time', async () => {
    const { registry, reads, watching, mode } = rig();
    registry.beat(boardOf(laneAt('w1:p1', '/w/repo', 'idle')));
    await settle();
    const held = holdOpen();
    mode.gate = held.gate;
    watching.get('/w/repo')?.fire();
    await settle();
    watching.get('/w/repo')?.fire();
    await settle();
    assert.equal(reads.length, 2, 'one running read, the second change waits');
    mode.gate = null;
    held.release();
    await settle();
    assert.deepEqual(reads, ['/w/repo full', '/w/repo tracked', '/w/repo tracked']);
});

test('the end of a turn asks for the full read, and a lane that keeps working does not', async () => {
    const { registry, reads } = rig();
    registry.beat(boardOf(laneAt('w1:p1', '/w/repo', 'working')));
    await settle();
    registry.beat(boardOf(laneAt('w1:p1', '/w/repo', 'working')));
    await settle();
    assert.equal(reads.length, 1);
    registry.beat(boardOf(laneAt('w1:p1', '/w/repo', 'idle')));
    await settle();
    assert.deepEqual(reads, ['/w/repo full', '/w/repo full']);
});

test('the safety refresh runs after the window, only for a root a shown tab uses', async () => {
    const { registry, reads, clock } = rig();
    const board = boardOf(laneAt('w1:p1', '/w/repo', 'idle'), laneAt('w1:p2', '/w/other', 'idle', 'w1:t2'));
    registry.beat(board);
    await settle();
    assert.equal(reads.length, 2);
    clock.at += 119_000;
    registry.tick(board);
    await settle();
    assert.equal(reads.length, 2, 'not yet');
    clock.at += 2_000;
    registry.tick({ ...board, hidden: new Set([tabId('w1:t2')]) });
    await settle();
    assert.deepEqual(reads.slice(2), ['/w/repo full']);
});

test('a lane that goes away is told to the feed; the last lane of a root closes its watch and drops its status', async () => {
    const { registry, watching, rows, bound, gone } = rig();
    registry.beat(boardOf(laneAt('w1:p1', '/w/repo', 'idle'), laneAt('w1:p2', '/w/repo', 'idle')));
    await settle();
    registry.beat(boardOf(laneAt('w1:p1', '/w/repo', 'idle')));
    assert.deepEqual([watching.get('/w/repo')?.closed, rows.size, [...bound.keys()], gone], [false, 1, ['w1:p1'], ['w1:p2']]);
    registry.beat(boardOf());
    assert.deepEqual([watching.get('/w/repo')?.closed, rows.size, bound.size, gone], [true, 0, 0, ['w1:p2', 'w1:p1']]);
});

test('a lane that moves to another repository leaves the first and joins the second', async () => {
    const { registry, watching, bound } = rig();
    registry.beat(boardOf(laneAt('w1:p1', '/w/repo', 'idle')));
    await settle();
    registry.beat(boardOf(laneAt('w1:p1', '/w/other', 'idle')));
    await settle();
    assert.deepEqual([watching.get('/w/repo')?.closed, watching.get('/w/other')?.closed, [...bound]], [true, false, [['w1:p1', '/w/other']]]);
});

test('switched off, the registry lets everything go and reads nothing; switched on, the next tick attaches again', async () => {
    const { registry, watching, rows, reads, mode } = rig();
    const board = boardOf(laneAt('w1:p1', '/w/repo', 'idle'));
    registry.beat(board);
    await settle();
    mode.enabled = 'off';
    registry.tick(board);
    registry.beat(board);
    await settle();
    assert.deepEqual([watching.get('/w/repo')?.closed, rows.size, reads.length], [true, 0, 1]);
    mode.enabled = 'on';
    registry.tick(board);
    await settle();
    assert.deepEqual([watching.size, rows.size, reads.length], [1, 1, 2]);
});

test('a failed read keeps the last status and is counted; the next read can still succeed', async () => {
    const { registry, watching, rows, mode, counts } = rig();
    registry.beat(boardOf(laneAt('w1:p1', '/w/repo', 'idle')));
    await settle();
    mode.answer = unknown({ why: 'timeout', after: duration(3000) });
    watching.get('/w/repo')?.fire();
    await settle();
    assert.equal(rows.get(dir('/w/repo'))?.tracked, 1);
    assert.equal(counts.get('failed'), 1);
    mode.answer = { kind: 'read', reading: reading(5, 0) };
    watching.get('/w/repo')?.fire();
    await settle();
    assert.equal(rows.get(dir('/w/repo'))?.tracked, 5);
});

test('the pane id type is the one the board uses', () => {
    assert.equal(paneId('w1:p1'), laneAt('w1:p1', null, 'idle').pane);
});
