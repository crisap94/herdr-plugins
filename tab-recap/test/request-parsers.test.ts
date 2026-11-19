import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCompactAsk, parseHandoffAskRecord, parseVisibilityAsk } from '#src/ports/requests.ts';
import { parseImportedChapterItem } from '#src/ports/imported-recaps.ts';

const HANDOFF_ID = 'hnd_01j3tt8z1efcd9tfr14d2pf2db';

const visibility = { target: 'w1:p1', visibility: 'toggle' };

const compact = { tab: 'w1:t1', pane: null, note: null };

const handoff = {
    id: HANDOFF_ID,
    at: 100,
    tab: 'w1:t1',
    pane: 'w1:p1',
    toPane: 'w1:p2',
    refresh: 'as-is',
    note: 'carry the plan',
    source: { kind: 'live' },
};

const item = { key: 'k1', section: 'Goals', text: 'ship the port', fact: 'the port is typed', born: true, anchor: null };

test('a visibility ask parses to its pane and one of hidden, shown or toggle, and anything else is refused', () => {
    assert.deepEqual(parseVisibilityAsk(visibility), { kind: 'ok', value: { target: 'w1:p1', visibility: 'toggle' } });
    assert.deepEqual(parseVisibilityAsk({ ...visibility, visibility: 'shown' }), { kind: 'ok', value: { target: 'w1:p1', visibility: 'shown' } });
    assert.equal(parseVisibilityAsk({ ...visibility, visibility: 'maybe' }).kind, 'err');
    assert.equal(parseVisibilityAsk({ ...visibility, target: '' }).kind, 'err');
    assert.equal(parseVisibilityAsk('not a row').kind, 'err');
});

test('a compact ask keeps an absent origin and answer out of its value, and refuses an origin that is not one', () => {
    assert.deepEqual(parseCompactAsk(compact), { kind: 'ok', value: { tab: 'w1:t1', pane: null, note: null } });
    assert.deepEqual(parseCompactAsk({ ...compact, pane: 'w1:p1', origin: 'auto', answer: 'done' }), {
        kind: 'ok',
        value: { tab: 'w1:t1', pane: 'w1:p1', note: null, origin: 'auto', answer: 'done' },
    });
    assert.equal(parseCompactAsk({ ...compact, origin: 'robot' }).kind, 'err');
    assert.equal(parseCompactAsk({ ...compact, tab: 7 }).kind, 'err');
});

test('a handoff ask record parses its live or closed source and refuses a malformed id or refresh', () => {
    const live = parseHandoffAskRecord(handoff);
    assert.equal(live.kind, 'ok');
    assert.deepEqual(live.value.source, { kind: 'live' });
    const closed = parseHandoffAskRecord({ ...handoff, source: { kind: 'closed', closedAt: 50 } });
    assert.deepEqual(closed.kind === 'ok' ? closed.value.source : null, { kind: 'closed', closedAt: 50 });
    assert.equal(parseHandoffAskRecord({ ...handoff, id: 'nope' }).kind, 'err');
    assert.equal(parseHandoffAskRecord({ ...handoff, refresh: 'sometimes' }).kind, 'err');
    assert.equal(parseHandoffAskRecord({ ...handoff, source: { kind: 'closed' } }).kind, 'err');
});

test('an imported chapter item parses its strings and its born flag, and refuses a missing flag', () => {
    assert.deepEqual(parseImportedChapterItem(item), { kind: 'ok', value: item });
    assert.deepEqual(parseImportedChapterItem({ ...item, anchor: 'a1' }), { kind: 'ok', value: { ...item, anchor: 'a1' } });
    assert.equal(parseImportedChapterItem({ ...item, born: 'yes' }).kind, 'err');
    assert.equal(parseImportedChapterItem(null).kind, 'err');
});
