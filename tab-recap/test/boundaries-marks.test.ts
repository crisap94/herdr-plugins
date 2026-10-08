import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marksOf } from '#src/recap/application/boundaries.ts';
import type { Read } from '#src/recap/application/boundaries.ts';
import { compactedFrom, settledBefore, triggerOf } from '#src/recap/domain/boundary.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import type { Chunk, Mark } from '#src/ports/transcripts.ts';

const AT = Date.parse('2026-10-07T16:38:09.490Z');
const read = (marks: readonly Mark[], pane = 'w1:p1'): Read => ({
    lane: { pane: paneId(pane) },
    chunk: { kind: 'chunk', entries: [], title: null, lastPrompt: null, claudeRecap: null, notes: [], marks, position: { cursor: 900, tail: null }, grew: true } satisfies Chunk,
});

// the marks as the readers return them (recorded from real sessions; the readers' own tests assert these exact values)
const CLAUDE: Mark = { kind: 'compacted', at: AT, tokensBefore: 39_532, tokensAfter: 3057, tookMs: 15_588, trigger: 'manual' };
const CODEX: Mark = { kind: 'compacted', at: Date.parse('2026-10-06T13:09:05.181Z'), tokensBefore: 17_133, tokensAfter: 4617 };
const OPENCODE: Mark = { kind: 'compacted', at: 1_790_000_009_000, tokensBefore: 1020, tookMs: 7000 };

test('each agent\'s own mark becomes one candidate with its time, tokens and the read\'s end cursor; a failed summarizer is none', () => {
    const found = marksOf([read([CLAUDE, { kind: 'compaction-failed', at: AT }]), read([CODEX], 'w1:p2'), read([OPENCODE], 'w1:p3')], 5, true);
    assert.deepEqual(found, [
        { pane: 'w1:p1', at: AT, cursor: 900, tokensBefore: 39_532, tokensAfter: 3057, tookMs: 15_588, trigger: 'manual' },
        { pane: 'w1:p2', at: CODEX.at, cursor: 900, tokensBefore: 17_133, tokensAfter: 4617 },
        { pane: 'w1:p3', at: OPENCODE.at, cursor: 900, tokensBefore: 1020, tookMs: 7000 },
    ]);
});

test('a lane that could not be read, and an agent that left no mark, add nothing', () => {
    assert.deepEqual(marksOf([{ lane: { pane: paneId('w1:p1') }, chunk: null }, read([])], 5, true), []);
});

test('a record without a time is dated by the read, but only when the read moves on', () => {
    const undated = read([{ kind: 'compacted', at: null }]);
    assert.deepEqual(marksOf([undated], 777, true), [{ pane: 'w1:p1', at: 777, cursor: 900 }]);
    assert.deepEqual(marksOf([undated], 777, false), []);
});

test('triggerOf: plugin from the start of the plugin\'s compaction up to ten minutes after it; else the agent\'s word; else auto', () => {
    const asked = [AT - 600_000];
    assert.equal(triggerOf(AT, asked, null), 'plugin');
    assert.equal(triggerOf(AT, asked, 'manual'), 'plugin', 'the plugin\'s own beats the agent\'s word');
    assert.equal(triggerOf(AT + 1, asked, null), 'auto');
    assert.equal(triggerOf(AT, [AT + 1], null), 'auto');
    assert.equal(triggerOf(AT, [], null), 'auto');
    assert.equal(triggerOf(AT, [], 'manual'), 'manual', 'the operator typed /compact in the agent');
    assert.equal(triggerOf(AT, [], 'auto'), 'auto');
});

test('compactedFrom plans each mark with its trigger: plugin, the agent\'s own word, or auto', () => {
    const marks = [{ pane: 'p', at: AT, cursor: 1, trigger: 'manual' as const }, { pane: 'p', at: AT + 5, cursor: 1 }, { pane: 'p', at: AT + 10, cursor: 1, trigger: 'auto' as const }];
    assert.deepEqual(compactedFrom(marks, null, []).map((each) => each.trigger), ['manual', 'auto', 'auto']);
    assert.deepEqual(compactedFrom(marks, null, [AT - 1]).map((each) => each.trigger), ['plugin', 'plugin', 'plugin']);
});

test('compactedFrom keeps the marks newer than the last boundary, oldest first', () => {
    const marks = [AT + 20, AT, AT + 10].map((at) => ({ pane: 'w1:p1', at, cursor: 1 }));
    assert.deepEqual(compactedFrom(marks, AT, []).map((each) => each.at), [AT + 10, AT + 20]);
    assert.deepEqual(compactedFrom(marks, null, []).map((each) => each.at), [AT, AT + 10, AT + 20]);
});

test('settledBefore: an item last carried before the lane\'s last boundary is settled; with no boundary nothing is', () => {
    assert.equal(settledBefore(AT - 1, AT), true);
    assert.equal(settledBefore(AT, AT), false);
    assert.equal(settledBefore(AT - 1, null), false);
});
