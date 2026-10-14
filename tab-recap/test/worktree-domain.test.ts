import { test } from 'node:test';
import assert from 'node:assert/strict';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import type { Count } from '#src/recap/domain/count.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import type { Directory } from '#src/recap/domain/directory.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { bumped, NO_COUNTS, perfLine } from '#src/recap/domain/perf.ts';
import { notesKey } from '#src/recap/domain/pane-notes.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { duration, instant } from '#src/recap/domain/time.ts';
import {
    changedOf, foldReading, IDLE_ROOT, movesOf, parseWorktreeSwitch, parseWorktreeWatch, refreshDue, runDone, strongest, takeRun, tierOf, wantRun,
} from '#src/recap/domain/worktree.ts';
import type { LaneGlance } from '#src/recap/domain/worktree.ts';
import { parsePorcelain } from '#src/recap/domain/porcelain.ts';
import type { PorcelainReading } from '#src/recap/domain/porcelain.ts';

const PORCELAIN = [
    '# branch.oid 0123456789abcdef', '# branch.head main', '# branch.upstream origin/main', '# branch.ab +2 -1',
    '1 .M N... 100644 100644 100644 a b src/a.ts', '2 R. N... 100644 100644 100644 a b R100 new.ts\told.ts', 'u UU N... 1 1 1 1 a b c x.ts', '? notes.txt', '? more.txt', '! ignored.log', '',
].join('\n');

const count = (n: number): Count => must(parseCount(n));
const dir = (path: string): Directory => must(parseDirectory(path));
const text = (raw: string): Text => must(parseText(raw));
const reading = (tracked: number, untracked: number, ahead: number | null = null): PorcelainReading => ({ branch: text('main'), ahead: ahead === null ? null : count(ahead), tracked: count(tracked), untracked: count(untracked) });

test('parsePorcelain: branch, ahead, tracked paths and untracked paths are told apart; ignored paths do not count', () => {
    const parsed = must(parsePorcelain(PORCELAIN));
    assert.deepEqual([parsed.branch, parsed.ahead, parsed.tracked, parsed.untracked], ['main', 2, 3, 2]);
});

test('parsePorcelain: no upstream means ahead null; a detached HEAD shows the short oid; a non-string is refused', () => {
    assert.equal(must(parsePorcelain('# branch.oid abc\n# branch.head feat/x\n')).ahead, null);
    assert.equal(must(parsePorcelain('# branch.oid 0123456789abcdef\n# branch.head (detached)\n')).branch, '0123456');
    assert.equal(parsePorcelain(7).kind, 'err');
});

test('parseWorktreeWatch: the three lines of rev-parse; a missing line is refused', () => {
    const found = must(parseWorktreeWatch('/w/repo\n/w/repo/.git\n/w/repo/.git\n'));
    assert.deepEqual([found.root, found.gitDir, found.commonDir], ['/w/repo', '/w/repo/.git', '/w/repo/.git']);
    assert.equal(parseWorktreeWatch('/w/repo\n/w/repo/.git\n').kind, 'err');
    assert.equal(parseWorktreeWatch(null).kind, 'err');
});

test('tierOf: a git-dir change is cheap; the attach, the turn end and the safety refresh count untracked files', () => {
    assert.deepEqual((['attached', 'git-dir', 'turn-ended', 'safety'] as const).map(tierOf), ['full', 'tracked', 'full', 'full']);
});

test('foldReading: the tracked tier keeps the last untracked count; the full tier replaces it; changed adds both', () => {
    const root = dir('/w/repo');
    const full = foldReading(null, root, 'full', reading(3, 2, 1), instant(10));
    assert.deepEqual([full.tracked, full.untracked, full.ahead, full.at], [3, 2, 1, 10]);
    assert.equal(changedOf(full), 5);
    const cheap = foldReading(full, root, 'tracked', reading(4, 0, 1), instant(20));
    assert.deepEqual([cheap.tracked, cheap.untracked, cheap.at], [4, 2, 20]);
    const first = foldReading(null, root, 'tracked', reading(4, 0), instant(30));
    assert.equal(first.untracked, null);
    assert.equal(changedOf(first), 4);
});

test('refreshDue: full once the window has passed, nothing before', () => {
    assert.equal(refreshDue(instant(0), instant(119_999), duration(120_000)), null);
    assert.equal(refreshDue(instant(0), instant(120_000), duration(120_000)), 'full');
});

test('the run of a root: requests merge into the strongest tier, one run at a time, a request during a run starts the next one after it', () => {
    assert.equal(strongest(null, 'tracked'), 'tracked');
    assert.equal(strongest('tracked', 'full'), 'full');
    assert.equal(strongest('full', 'tracked'), 'full');
    const wanted = wantRun(wantRun(IDLE_ROOT, 'tracked'), 'full');
    const first = takeRun(wanted);
    assert.equal(first.start, 'full');
    assert.deepEqual(first.state, { running: true, wanted: null });
    const during = wantRun(first.state, 'tracked');
    assert.equal(takeRun(during).start, null, 'nothing starts while one is running');
    const next = takeRun(runDone(during));
    assert.equal(next.start, 'tracked');
    assert.equal(takeRun(runDone(next.state)).start, null);
});

const laneAt = (pane: string, cwd: string | null, status: string): Lane => laneFrom({ paneId: pane, tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status, cwd });

test('movesOf: a new lane attaches, a moved cwd attaches again, a gone lane detaches, a working lane that stops ended its turn', () => {
    const p1 = paneId('w1:p1');
    const p2 = paneId('w1:p2');
    const lanes = (...all: Lane[]): ReadonlyMap<PaneId, Lane> => new Map(all.map((lane): [PaneId, Lane] => [lane.pane, lane]));
    const first = movesOf(new Map(), lanes(laneAt('w1:p1', '/a', 'working'), laneAt('w1:p2', null, 'idle')));
    assert.deepEqual(first.attach.map((one) => [one.pane, one.cwd]), [[p1, '/a'], [p2, null]]);
    assert.deepEqual([first.detach, first.ended], [[], []]);
    const same = movesOf(first.known, lanes(laneAt('w1:p1', '/a', 'working'), laneAt('w1:p2', null, 'idle')));
    assert.deepEqual([same.attach, same.detach, same.ended], [[], [], []]);
    const next = movesOf(same.known, lanes(laneAt('w1:p1', '/b', 'idle')));
    assert.deepEqual(next.attach.map((one) => [one.pane, one.cwd]), [[p1, '/b']]);
    assert.deepEqual([next.detach, next.ended], [[p2], [p1]]);
    const known: ReadonlyMap<PaneId, LaneGlance> = next.known;
    assert.deepEqual([...known.keys()], [p1]);
});

test('parseWorktreeSwitch: off in any case, anything else is on', () => {
    assert.deepEqual(['off', ' OFF ', 'on', undefined, 'maybe'].map((raw) => must(parseWorktreeSwitch(raw))), ['off', 'off', 'on', 'on', 'on']);
});

test('perf: counters bump one by one and the line carries window, counters, cpu share and rss', () => {
    const counts = bumped(bumped(bumped(NO_COUNTS, 'status-full'), 'status-full'), 'locate');
    assert.equal(counts.get('status-full'), 2);
    assert.equal(NO_COUNTS.size, 0, 'bumping never changes the counts it started from');
    const line = perfLine({ elapsed: duration(60_000), counts, cpu: duration(1200), rss: count(250) });
    assert.equal(line, 'perf window=60s status-tracked=0 status-full=2 locate=1 git-dir-event=0 status-coalesced=0 failed=0 cpu=1200ms cpu-share=2% rss=250MiB');
});

test('notesKey: the same notes give the same key, a changed value another', () => {
    const one = [{ label: 'note', value: 'a' }];
    assert.equal(notesKey(one), notesKey([{ label: 'note', value: 'a' }]));
    assert.notEqual(notesKey(one), notesKey([{ label: 'note', value: 'b' }]));
    assert.notEqual(notesKey([]), notesKey(one));
});
