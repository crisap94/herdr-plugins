import { test } from 'node:test';
import assert from 'node:assert/strict';
import { continuationNote, cutNote, NOTE_LIMIT } from '#src/recap/domain/continuation-note.ts';
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
