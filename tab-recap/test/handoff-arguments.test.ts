import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handoffArgumentsOf } from '../bin/handoff.ts';

const FROM = 'w1:p1';
const TO = 'w1:p2';

test('a deliver request names its source and target, and refresh is off unless asked for', () => {
    assert.deepEqual(handoffArgumentsOf({ from: [FROM], to: [TO] }, ['handoff']), { mode: 'deliver', from: FROM, to: TO, note: null, refresh: false, closed: null });
    assert.deepEqual(handoffArgumentsOf({ from: [FROM], to: [TO], refresh: true }, ['handoff']), { mode: 'deliver', from: FROM, to: TO, note: null, refresh: true, closed: null });
});

test('print needs no target; with one, the target is kept', () => {
    assert.deepEqual(handoffArgumentsOf({ from: [FROM], print: true }, ['handoff']), { mode: 'print', from: FROM, to: null, note: null, closed: null });
    assert.deepEqual(handoffArgumentsOf({ from: [FROM], to: [TO], print: true }, ['handoff']), { mode: 'print', from: FROM, to: TO, note: null, closed: null });
});

test('a blank note is no note', () => {
    assert.deepEqual(handoffArgumentsOf({ from: [FROM], to: [TO], note: '   ' }, ['handoff']), { mode: 'deliver', from: FROM, to: TO, note: null, refresh: false, closed: null });
});

test('a missing --from, a repeated --from or --to, and a missing --to without --print are usage problems', () => {
    assert.deepEqual(handoffArgumentsOf({ to: [TO] }, ['handoff']), { problem: '--from is required' });
    assert.deepEqual(handoffArgumentsOf({ from: [FROM, 'w1:p3'], to: [TO] }, ['handoff']), { problem: '--from given more than once' });
    assert.deepEqual(handoffArgumentsOf({ from: [FROM], to: [TO, 'w1:p3'] }, ['handoff']), { problem: '--to given more than once' });
    assert.deepEqual(handoffArgumentsOf({ from: [FROM] }, ['handoff']), { problem: '--to is required unless --print' });
});

test('--refresh with --print is a usage problem', () => {
    assert.deepEqual(handoffArgumentsOf({ from: [FROM], print: true, refresh: true }, ['handoff']), { problem: '--refresh does not go with --print' });
});

test('an empty pane id is a usage problem, and so is a stray positional', () => {
    assert.deepEqual(handoffArgumentsOf({ from: [''], to: [TO] }, ['handoff']), { problem: '--from needs a pane id' });
    assert.deepEqual(handoffArgumentsOf({ from: [FROM], to: [''] }, ['handoff']), { problem: '--to needs a pane id' });
    assert.deepEqual(handoffArgumentsOf({ from: [FROM], to: [TO] }, ['handoff', 'extra']), { problem: 'handoff takes no argument' });
});

const CLOSED = { 'from-closed': [FROM], tab: ['w1:t1'], 'closed-at': ['1000'] };

test('a complete closed tuple names the closed lane as the source, with the close instant', () => {
    assert.deepEqual(handoffArgumentsOf({ ...CLOSED, to: [TO] }, ['handoff']), { mode: 'deliver', from: FROM, to: TO, note: null, refresh: false, closed: { tab: 'w1:t1', pane: FROM, closedAt: 1000 } });
    assert.deepEqual(handoffArgumentsOf({ ...CLOSED, print: true }, ['handoff']), { mode: 'print', from: FROM, to: null, note: null, closed: { tab: 'w1:t1', pane: FROM, closedAt: 1000 } });
});

test('the closed source and the live source are exclusive, the tuple is all-or-none and --closed-at is a non-negative integer', () => {
    assert.deepEqual(handoffArgumentsOf({ ...CLOSED, from: [FROM], to: [TO] }, ['handoff']), { problem: '--from and --from-closed are exclusive' });
    assert.deepEqual(handoffArgumentsOf({ 'from-closed': [FROM], to: [TO] }, ['handoff']), { problem: '--from-closed, --tab and --closed-at go together' });
    assert.deepEqual(handoffArgumentsOf({ ...CLOSED, 'closed-at': ['-1'], to: [TO] }, ['handoff']), { problem: '--closed-at needs a non-negative integer' });
    assert.deepEqual(handoffArgumentsOf({ ...CLOSED, 'closed-at': ['1e3'], to: [TO] }, ['handoff']), { problem: '--closed-at needs a non-negative integer' });
});

test('a closed source takes no --refresh', () => {
    assert.deepEqual(handoffArgumentsOf({ ...CLOSED, to: [TO], refresh: true }, ['handoff']), { problem: '--from-closed does not go with --refresh' });
});

test('the listing takes --tab alone and nothing that selects a source or a target', () => {
    assert.deepEqual(handoffArgumentsOf({ 'list-closed': true, tab: ['w1:t1'] }, ['handoff']), { mode: 'list', tab: 'w1:t1' });
    assert.deepEqual(handoffArgumentsOf({ 'list-closed': true }, ['handoff']), { problem: '--list-closed needs --tab' });
    assert.deepEqual(handoffArgumentsOf({ 'list-closed': true, tab: ['w1:t1'], to: [TO] }, ['handoff']), { problem: '--list-closed takes only --tab' });
});
