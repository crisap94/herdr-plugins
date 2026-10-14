import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PaneNoteWriter } from '#src/ports/worktree-status.ts';
import { PaneNoteFeed } from '#src/recap/application/pane-note-feed.ts';
import { PerfLedger } from '#src/recap/application/perf-ledger.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import type { NoteToken } from '#src/recap/domain/coordination.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import { duration, instant } from '#src/recap/domain/time.ts';

function store(): { readonly writer: PaneNoteWriter; readonly calls: string[] } {
    const calls: string[] = [];
    const writer: PaneNoteWriter = {
        replace: (pane, notes: readonly NoteToken[]): void => { calls.push(`replace ${pane} ${notes.map((note) => `${note.label}=${note.value}`).join(',')}`); },
        forget: (pane): void => { calls.push(`forget ${pane}`); },
        reset: (): void => { calls.push('reset'); },
    };
    return { writer, calls };
}

test('the feed starts from nothing, writes a pane\'s notes when they change and only then, and forgets a pane once', () => {
    const { writer, calls } = store();
    const feed = new PaneNoteFeed(writer);
    const pane = paneId('w1:p1');
    feed.update(pane, []);
    feed.update(pane, []);
    feed.update(pane, [{ label: 'note', value: 'hold' }]);
    feed.update(pane, [{ label: 'note', value: 'hold' }]);
    feed.update(pane, [{ label: 'note', value: 'go' }]);
    feed.update(pane, []);
    feed.forget(pane);
    feed.forget(pane);
    assert.deepEqual(calls, ['reset', 'forget w1:p1', 'replace w1:p1 note=hold', 'replace w1:p1 note=go', 'forget w1:p1', 'forget w1:p1']);
});

test('the perf ledger logs one line per tick with the counts and the cpu of the window, then starts over', () => {
    const lines: string[] = [];
    let now = 1000;
    let cpu = 500;
    const ledger = new PerfLedger({
        usage: { sample: () => ({ cpu: duration(cpu), rss: must(parseCount(120)) }) },
        clock: { now: () => instant(now) },
        log: (line): void => { lines.push(line); },
    });
    ledger.bump('status-full');
    ledger.bump('status-tracked');
    ledger.bump('status-tracked');
    now += 60_000;
    cpu += 600;
    ledger.tick();
    now += 60_000;
    ledger.tick();
    assert.deepEqual(lines, [
        'perf window=60s status-tracked=2 status-full=1 locate=0 git-dir-event=0 status-coalesced=0 failed=0 cpu=600ms cpu-share=1% rss=120MiB',
        'perf window=60s status-tracked=0 status-full=0 locate=0 git-dir-event=0 status-coalesced=0 failed=0 cpu=0ms cpu-share=0% rss=120MiB',
    ]);
});
