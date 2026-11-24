import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADVANCED, marksOf, NOT_ADVANCED } from '#src/recap/application/boundaries.ts';
import type { Read } from '#src/recap/application/boundaries.ts';
import { compactedFrom, settledBefore, triggerOf } from '#src/recap/domain/boundary.ts';
import { paneId } from '#test/support/ids.ts';
import type { Chunk, Mark } from '#src/ports/transcripts.ts';
import { instant, duration } from '#src/recap/domain/time.ts';
import { grewOf, cursorOf } from '#src/ports/transcripts.ts';
import { countOf } from '#src/recap/domain/count.ts';
import { paneIdOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/lane-shape.ts';

const AT = Date.parse('2026-10-07T16:38:09.490Z');
const read = (marks: readonly Mark[], pane = 'w1:p1'): Read => ({
    lane: { pane: paneId(pane) },
    chunk: { kind: 'chunk', entries: [], title: null, lastPrompt: null, harnessRecap: null, notes: [], marks, position: { cursor: cursorOf(900), tail: null }, grew: grewOf(true) } satisfies Chunk,
});

const CLAUDE: Mark = { kind: 'compacted', at: instant(AT), tokensBefore: countOf(39_532), tokensAfter: countOf(3057), tookMs: duration(15_588), trigger: 'manual' };
const CODEX: Mark = { kind: 'compacted', at: instant(Date.parse('2026-10-06T13:09:05.181Z')), tokensBefore: countOf(17_133), tokensAfter: countOf(4617) };
const OPENCODE: Mark = { kind: 'compacted', at: instant(1_790_000_009_000), tokensBefore: countOf(1020), tookMs: duration(7000) };

test('each agent\'s own mark becomes one candidate with its time, tokens and the read\'s end cursor; a failed summarizer is none', () => {
    const found = marksOf([read([CLAUDE, { kind: 'compaction-failed', at: instant(AT) }]), read([CODEX], 'w1:p2'), read([OPENCODE], 'w1:p3')], instant(5), ADVANCED);
    assert.deepEqual(found, [
        { key: 'w1:p1', at: AT, cursor: 900, tokensBefore: 39_532, tokensAfter: countOf(3057), tookMs: 15_588, trigger: 'manual' },
        { key: 'w1:p2', at: CODEX.at, cursor: 900, tokensBefore: 17_133, tokensAfter: countOf(4617) },
        { key: 'w1:p3', at: OPENCODE.at, cursor: 900, tokensBefore: countOf(1020), tookMs: duration(7000) },
    ]);
});

test('a lane that could not be read, and an agent that left no mark, add nothing', () => {
    assert.deepEqual(marksOf([{ lane: { pane: paneId('w1:p1') }, chunk: null }, read([])], instant(5), ADVANCED), []);
});

test('a record without a time is dated by the read, but only when the read moves on', () => {
    const undated = read([{ kind: 'compacted', at: null }]);
    assert.deepEqual(marksOf([undated], instant(777), ADVANCED), [{ key: 'w1:p1', at: 777, cursor: 900 }]);
    assert.deepEqual(marksOf([undated], instant(777), NOT_ADVANCED), []);
});

test('triggerOf: plugin from the start of the plugin\'s compaction up to ten minutes after it; else the agent\'s word; else auto', () => {
    const asked = [instant(AT - 600_000)];
    assert.equal(triggerOf(instant(AT), asked, null), 'plugin');
    assert.equal(triggerOf(instant(AT), asked, 'manual'), 'plugin', 'the plugin\'s own beats the agent\'s word');
    assert.equal(triggerOf(instant(AT + 1), asked, null), 'auto');
    assert.equal(triggerOf(instant(AT), [instant(AT + 1)], null), 'auto');
    assert.equal(triggerOf(instant(AT), [], null), 'auto');
    assert.equal(triggerOf(instant(AT), [], 'manual'), 'manual', 'the operator typed /compact in the agent');
    assert.equal(triggerOf(instant(AT), [], 'auto'), 'auto');
});

test('compactedFrom plans each mark with its trigger: plugin, the agent\'s own word, or auto', () => {
    const marks = [{ key: paneIdOf('p'), at: instant(AT), cursor: countOf(1), trigger: 'manual' as const }, { key: paneIdOf('p'), at: instant(AT + 5), cursor: countOf(1) }, { key: paneIdOf('p'), at: instant(AT + 10), cursor: countOf(1), trigger: 'auto' as const }];
    assert.deepEqual(compactedFrom(marks, null, []).map((each) => each.trigger), ['manual', 'auto', 'auto']);
    assert.deepEqual(compactedFrom(marks, null, [instant(AT - 1)]).map((each) => each.trigger), ['plugin', 'plugin', 'plugin']);
});

test('compactedFrom keeps the marks newer than the last boundary, oldest first', () => {
    const marks = [AT + 20, AT, AT + 10].map((at) => ({ key: paneIdOf('w1:p1'), at: instant(at), cursor: countOf(1) }));
    assert.deepEqual(compactedFrom(marks, instant(AT), []).map((each) => each.at), [AT + 10, AT + 20]);
    assert.deepEqual(compactedFrom(marks, null, []).map((each) => each.at), [AT, AT + 10, AT + 20]);
});

test('settledBefore: an item last carried before the lane\'s last boundary is settled; with no boundary nothing is', () => {
    assert.equal(settledBefore(instant(AT - 1), instant(AT)), true);
    assert.equal(settledBefore(instant(AT), instant(AT)), false);
    assert.equal(settledBefore(instant(AT - 1), null), false);
});
