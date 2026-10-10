// The notes other tools write on a lane's pane: read through a cache, labelled by tool, nothing for tab-recap's own tokens, refreshed after the TTL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TokenNotes, TTL_MS } from '#src/extensions/token-notes.ts';
import type { PaneTokensResult } from '#src/ports/pane-tokens.ts';
import { unknown } from '#src/ports/unknowable.ts';
import type { TabLane } from '#src/ports/tab-views.ts';

const lane = (pane: string): TabLane => ({ pane, agent: 'claude', status: 'idle', title: null, cwd: null });
const flush = (): Promise<void> => new Promise<void>((resolve) => { setImmediate(resolve); });

function notesWith(read: (pane: string) => PaneTokensResult): { notes: TokenNotes; reads: string[]; clock: { at: number } } {
    const clock = { at: 0 };
    const reads: string[] = [];
    const notes = new TokenNotes({ panes: { read: async (pane: string): Promise<PaneTokensResult> => { reads.push(pane); return read(pane); } }, now: (): number => clock.at });
    return { notes, reads, clock };
}

test('a note on the lane\'s pane is shown with its tool\'s name, after the first read; the first render reads and shows nothing yet', async () => {
    const { notes, reads } = notesWith(() => ({ kind: 'tokens', tokens: { 'note-coordinator': 'waiting for review', 'tab-recap-api': '1' } }));
    const first = notes.notes([lane('w1:p1')]);
    assert.equal(first.kind === 'notes' ? first.byPane.size : -1, 0);
    await flush();
    const second = notes.notes([lane('w1:p1')]);
    assert.ok(second.kind === 'notes');
    assert.deepEqual(second.byPane.get('w1:p1'), [{ label: 'coordinator', at: null, details: ['waiting for review'] }]);
    assert.deepEqual(reads, ['w1:p1']);
});

test('the plugin\'s own tokens are no note; a bare `note` is labelled `note`', async () => {
    const { notes } = notesWith(() => ({ kind: 'tokens', tokens: { 'tab-recap-api': '1', 'tab-recap-needs': '2', note: 'hold' } }));
    notes.notes([lane('w1:p1')]);
    await flush();
    const found = notes.notes([lane('w1:p1')]);
    assert.ok(found.kind === 'notes');
    assert.deepEqual(found.byPane.get('w1:p1'), [{ label: 'note', at: null, details: ['hold'] }]);
});

test('a lane whose read failed keeps what it had, and is read again once its back-off has passed', async () => {
    let fail = false;
    const { notes, reads, clock } = notesWith(() => (fail ? unknown({ why: 'unreachable', detail: 'fake' }) : { kind: 'tokens', tokens: { 'note-x': 'kept' } }));
    notes.notes([lane('w1:p1')]);
    await flush();
    fail = true;
    clock.at = TTL_MS;
    notes.notes([lane('w1:p1')]);
    await flush();
    const kept = notes.notes([lane('w1:p1')]);
    assert.ok(kept.kind === 'notes');
    assert.equal(kept.byPane.get('w1:p1')?.[0]?.details[0], 'kept');
    // the failed read backs off: the render that follows waits, and herdr is not asked on every render while it is unreachable
    assert.deepEqual(reads, ['w1:p1', 'w1:p1']);
});

test('nothing is read again inside the TTL, and a lane that goes away is no longer shown', async () => {
    const { notes, reads, clock } = notesWith(() => ({ kind: 'tokens', tokens: { 'note-x': 'hi' } }));
    notes.notes([lane('w1:p1')]);
    await flush();
    clock.at = TTL_MS - 1;
    notes.notes([lane('w1:p1')]);
    await flush();
    assert.deepEqual(reads, ['w1:p1']);
    const gone = notes.notes([]);
    assert.ok(gone.kind === 'notes');
    assert.equal(gone.byPane.size, 0);
});
