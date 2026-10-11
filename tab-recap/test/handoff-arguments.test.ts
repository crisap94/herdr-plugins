import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handoffArgumentsOf } from '../bin/handoff.ts';

const FROM = 'w1:p1';
const TO = 'w1:p2';

test('a deliver request names its source and target, and refresh is off unless asked for', () => {
    assert.deepEqual(handoffArgumentsOf({ from: [FROM], to: [TO] }, ['handoff']), { mode: 'deliver', from: FROM, to: TO, note: null, refresh: false });
    assert.deepEqual(handoffArgumentsOf({ from: [FROM], to: [TO], refresh: true }, ['handoff']), { mode: 'deliver', from: FROM, to: TO, note: null, refresh: true });
});

test('print needs no target; with one, the target is kept', () => {
    assert.deepEqual(handoffArgumentsOf({ from: [FROM], print: true }, ['handoff']), { mode: 'print', from: FROM, to: null, note: null });
    assert.deepEqual(handoffArgumentsOf({ from: [FROM], to: [TO], print: true }, ['handoff']), { mode: 'print', from: FROM, to: TO, note: null });
});

test('a blank note is no note', () => {
    assert.deepEqual(handoffArgumentsOf({ from: [FROM], to: [TO], note: '   ' }, ['handoff']), { mode: 'deliver', from: FROM, to: TO, note: null, refresh: false });
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
