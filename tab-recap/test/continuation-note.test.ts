import { test } from 'node:test';
import assert from 'node:assert/strict';
import { continuationNote, cutNote, keepsNote, NOTE_LIMIT, withNote } from '#src/recap/domain/continuation-note.ts';
import { awaitedNames, backgroundItem, backgroundLabel, backgroundTool, NOT_AWAITING } from '#src/recap/domain/in-flight.ts';
import type { Awaiting, BackgroundItem } from '#src/recap/domain/in-flight.ts';

const on = (names: string): Awaiting => ({ kind: 'on', names: awaitedNames(names) });
const item = (tool: string, label: string | null): BackgroundItem => backgroundItem(backgroundTool(tool), label === null ? null : backgroundLabel(label));

test('both parts', () => {
    assert.equal(continuationNote(on('reviewer'), [item('Monitor', 'open merge requests')]), 'Still waiting for: reviewer. Still running: Monitor "open merge requests".');
});

test('each part alone', () => {
    assert.equal(continuationNote(on('reviewer,tester'), []), 'Still waiting for: reviewer,tester.');
    assert.equal(continuationNote(NOT_AWAITING, [item('Bash', 'watch ci'), item('Agent', null)]), 'Still running: Bash "watch ci", Agent "Agent".');
});

test('nothing to name gives no note', () => {
    assert.equal(continuationNote(NOT_AWAITING, []), null);
});

test('the plain-text sanitizer: line breaks, controls and quotes cannot break the note', () => {
    assert.equal(continuationNote(on('a\nb'), [item('Monitor', 'say "hi"\u0000\tnow')]), 'Still waiting for: a b. Still running: Monitor "say \'hi\' now".');
});

test('the note is cut to the limit, with an ellipsis', () => {
    const many = Array.from({ length: 40 }, (_, index) => item('Monitor', `watcher number ${index} of the long list`));
    const note = continuationNote(on('reviewer'), many) ?? '';
    assert.equal(Array.from(note).length, NOTE_LIMIT);
    assert.ok(note.endsWith('…'));
    assert.ok(note.startsWith('Still waiting for: reviewer. Still running: Monitor "watcher number 0'));
});

test('a note at the limit is kept whole; a longer one loses its tail only', () => {
    assert.equal(cutNote('x'.repeat(400), NOTE_LIMIT), 'x'.repeat(400));
    assert.equal(cutNote('x'.repeat(401), NOTE_LIMIT), `${'x'.repeat(399)}…`);
});

test('a brief keeps the note when every name and label of it appears in it, in any case', () => {
    const note = continuationNote(on('reviewer,tester'), [item('Monitor', 'open merge requests')]) ?? '';
    assert.equal(keepsNote('Waiting for the Reviewer and TESTER; the open merge requests monitor runs.', note), true);
    assert.equal(keepsNote('Waiting for the reviewer and tester.', note), false);
    assert.equal(keepsNote('Waiting for the reviewer.', note), false);
});

test('a note that the brief lost is appended whole; one it kept leaves the brief alone', () => {
    const note = continuationNote(on('reviewer'), []) ?? '';
    assert.equal(withNote('Ship the rewrite.', note), `Ship the rewrite. ${note}`);
    assert.equal(withNote('Ship the rewrite once the reviewer answers.', note), 'Ship the rewrite once the reviewer answers.');
});

test('short names are tested too: a brief that dropped a1 does not keep the note, one that mentions it does', () => {
    const note = continuationNote(on('a1'), []) ?? '';
    assert.equal(keepsNote('Ship the rewrite.', note), false);
    assert.equal(keepsNote('Ship the rewrite once A1 answers.', note), true);
    const mixed = continuationNote(on('a1'), [item('Monitor', 'open merge requests')]) ?? '';
    assert.equal(keepsNote('The open merge requests monitor runs.', mixed), false);
});

test('a word counts only as a whole word, in any letter case', () => {
    const note = continuationNote(NOT_AWAITING, [item('Monitor', 'open merge')]) ?? '';
    assert.equal(keepsNote('A monitor opened a merge emerged.', note), false);
    assert.equal(keepsNote('A MONITOR: open, then merge.', note), true);
});
