import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactNoteOf } from '#src/recap/domain/compact-note.ts';
import { requestNoteOf, startCompact } from '#src/recap/application/compact-start.ts';
import type { CompactStart } from '#src/recap/application/compact-start.ts';
import { NOTE_LIMIT } from '#src/recap/application/compaction-message.ts';
import { changes, draftFrom, initial, locksOf } from '#src/recap/application/setup-keys.ts';
import type { Draft } from '#src/recap/application/setup-keys.ts';
import type { Done } from '#src/ports/columns.ts';
import type { CompactRequest } from '#src/ports/requests.ts';
import { unknown } from '#src/ports/unknowable.ts';

const TAB = 'w1:t1';
const PANE = 'w1:p2';
const models = { claude: '', codex: '', opencode: '', hermes: '', custom: '' };

function recorder(done: Done = { kind: 'done' }): { asked: [string, string | null][]; queued: CompactRequest[]; start: CompactStart } {
    const asked: [string, string | null][] = [];
    const queued: CompactRequest[] = [];
    const start: CompactStart = {
        askNote: (tab, pane) => { asked.push([tab, pane]); return Promise.resolve(done); },
        queue: (request) => { queued.push(request); return done; },
    };
    return { asked, queued, start };
}

test('the setting is ask unless it says skip: a fresh install opens the note popup as before', () => {
    assert.equal(compactNoteOf(undefined), 'ask');
    assert.equal(compactNoteOf(''), 'ask');
    assert.equal(compactNoteOf('maybe'), 'ask');
    assert.equal(compactNoteOf(' SKIP '), 'skip');
    assert.equal(draftFrom({ backend: 'codex', models }, { locale: undefined, recapLanguage: undefined }).compactNote, 'ask');
});

test('ask: the popup opens for the pane and nothing is queued until the operator sends it', async () => {
    const r = recorder();
    assert.deepEqual(await startCompact(TAB, PANE, undefined, 'ask', r.start), { kind: 'done' });
    assert.deepEqual(r.asked, [[TAB, PANE]]);
    assert.deepEqual(r.queued, []);
});

test('skip: the request the popup sends for an empty note is queued at once, and no popup opens', async () => {
    const r = recorder();
    assert.deepEqual(await startCompact(TAB, PANE, undefined, 'skip', r.start), { kind: 'done' });
    assert.deepEqual(r.asked, [], 'no modal call');
    assert.deepEqual(r.queued, [{ tab: TAB, pane: PANE, note: null }]);
});

test('skip with no pane known queues for the tab, as the popup does when no pane is given', async () => {
    const r = recorder();
    await startCompact(TAB, null, undefined, 'skip', r.start);
    assert.deepEqual(r.queued, [{ tab: TAB, pane: null, note: null }]);
});

test('--note queues at once with that note, whatever the setting says, and opens no popup', async () => {
    for (const setting of ['ask', 'skip'] as const) {
        const r = recorder();
        await startCompact(TAB, PANE, requestNoteOf('keep  the\ntests '), setting, r.start);
        assert.deepEqual(r.asked, [], `no popup when the setting is ${setting}`);
        assert.deepEqual(r.queued, [{ tab: TAB, pane: PANE, note: 'keep the tests' }]);
    }
});

test('--note "" queues with no note and opens no popup, even when the setting is ask', async () => {
    assert.equal(requestNoteOf('   '), null);
    const r = recorder();
    await startCompact(TAB, PANE, requestNoteOf('   '), 'ask', r.start);
    assert.deepEqual(r.asked, []);
    assert.deepEqual(r.queued, [{ tab: TAB, pane: PANE, note: null }]);
});

test('a --note is one line and at most as long as the popup allows', () => {
    assert.equal(requestNoteOf('line one\nline two'), 'line one line two');
    assert.equal(Array.from(requestNoteOf('x'.repeat(NOTE_LIMIT + 50)) ?? '').length, NOTE_LIMIT);
});

test('a 280-character cut that lands on a space leaves no trailing space', () => {
    assert.equal(requestNoteOf(`${'x'.repeat(NOTE_LIMIT - 1)} tail`), 'x'.repeat(NOTE_LIMIT - 1));
});

test('control characters are not sent: a tab or a newline is a space, an escape or a bell is dropped', () => {
    assert.equal(requestNoteOf('a\tb\u001b[31mred\u0007 x'), 'a b[31mred x');
    assert.equal(requestNoteOf('line one\r\nline two'), 'line one line two');
    assert.equal(requestNoteOf('\u0007\u001b'), null, 'nothing left is no note');
    assert.doesNotMatch(requestNoteOf('keep\u0000\u009b this') ?? '', /\p{Cc}/u);
});

test('a request that cannot be queued, or a popup that does not open, is reported as unknown', async () => {
    const queueFails = recorder(unknown({ why: 'unreadable', detail: 'the state store is not ready' }));
    const queued = await startCompact(TAB, PANE, undefined, 'skip', queueFails.start);
    assert.equal(queued.kind, 'unknown');
    const popupFails = recorder(unknown({ why: 'unreachable', detail: 'no herdr' }));
    const asked = await startCompact(TAB, PANE, undefined, 'ask', popupFails.start);
    assert.equal(asked.kind, 'unknown');
});

test('the modal writes TAB_RECAP_COMPACT_NOTE when its row changes, and a locked row is never written', () => {
    const draft: Draft = draftFrom({ backend: 'codex', models }, { locale: undefined, recapLanguage: undefined });
    const state = initial({ ...draft, compactNote: 'skip' }, {});
    assert.deepEqual([...changes({ ...state, stored: draft })], [['TAB_RECAP_COMPACT_NOTE', 'skip']]);
    assert.deepEqual(locksOf({ TAB_RECAP_COMPACT_NOTE: 'skip' }), { compactNote: 'TAB_RECAP_COMPACT_NOTE' });
    assert.equal(changes({ ...state, stored: draft, locks: { compactNote: 'TAB_RECAP_COMPACT_NOTE' } }).size, 0);
});
