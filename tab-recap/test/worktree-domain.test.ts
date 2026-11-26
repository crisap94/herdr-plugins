import { test } from 'node:test';
import assert from 'node:assert/strict';
import { must } from '@stateforge-labs/session-ledger';
import { parseCount } from '@stateforge-labs/session-ledger';
import type { Count } from '@stateforge-labs/session-ledger';
import { bumped, NO_COUNTS, perfLine } from '#src/recap/domain/perf.ts';
import { notesKey } from '#src/recap/domain/pane-notes.ts';
import { textOf } from '@stateforge-labs/session-ledger';
import { duration } from '@stateforge-labs/session-ledger';
import { parseWorktreeSwitch, parseWorktreeWatch } from '#src/recap/domain/worktree.ts';

const count = (n: number): Count => must(parseCount(n));

test('parseWorktreeWatch: the three lines of rev-parse; a missing line is refused', () => {
    const found = must(parseWorktreeWatch('/w/repo\n/w/repo/.git\n/w/repo/.git\n'));
    assert.deepEqual([found.root, found.gitDir, found.commonDir], ['/w/repo', '/w/repo/.git', '/w/repo/.git']);
    assert.equal(parseWorktreeWatch('/w/repo\n/w/repo/.git\n').kind, 'err');
    assert.equal(parseWorktreeWatch(null).kind, 'err');
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
    const one = [{ label: textOf('note'), value: textOf('a') }];
    assert.equal(notesKey(one), notesKey([{ label: textOf('note'), value: textOf('a') }]));
    assert.notEqual(notesKey(one), notesKey([{ label: textOf('note'), value: textOf('b') }]));
    assert.notEqual(notesKey([]), notesKey(one));
});
