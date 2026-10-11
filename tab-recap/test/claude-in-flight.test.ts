import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLAUDE_SPLIT, claudeInFlight } from '#src/adapters/claude-in-flight.ts';
import type { BackgroundSplit, InFlightResult } from '#src/ports/transcripts.ts';

const FOREGROUND_ONLY: BackgroundSplit = { kind: 'foreground-only', why: 'codex-cells' };
const counting = (lines: readonly string[], truncated = false): InFlightResult => claudeInFlight(lines, truncated, FOREGROUND_ONLY);

const line = (row: object): string => JSON.stringify(row);
const launch = (id: string, name: string, input: object = {}): string => line({ type: 'assistant', isSidechain: false, message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } });
const started = (id: string, task: string): string => line({ type: 'user', toolUseResult: { stdout: '', backgroundTaskId: task }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: `Command running in background with ID: ${task}. Output is being written to: /x/${task}.output.` }] } });
const notice = (task: string, tool: string | null, status: string): string => line({ type: 'user', origin: { kind: 'task-notification' }, message: { role: 'user', content: `<task-notification>\n<task-id>${task}</task-id>\n${tool === null ? '' : `<tool-use-id>${tool}</tool-use-id>\n`}<status>${status}</status>\n<summary>x</summary>\n</task-notification>` } });
const shell = (id: string): string => launch(id, 'Bash', { command: 'sleep 99', run_in_background: true });
const named = (id: string, description: string): string => launch(id, 'Bash', { command: 'sleep 99', run_in_background: true, description });
const separates: BackgroundSplit = { kind: 'separates' };

test('in flight: a background shell with no end is one', () => {
    assert.deepEqual(counting([shell('t1'), started('t1', 'b1')]), { kind: 'in-flight', count: 1, background: [] });
});

test('in flight: a completed, failed, killed or stopped notice ends it (by tool-use id, or by the task id its result stated)', () => {
    for (const status of ['completed', 'failed', 'killed', 'stopped']) {
        assert.deepEqual(counting([shell('t1'), started('t1', 'b1'), notice('b1', 't1', status)]), { kind: 'in-flight', count: 0, background: [] }, status);
    }
    assert.deepEqual(counting([shell('t1'), started('t1', 'b1'), notice('b1', null, 'killed')]), { kind: 'in-flight', count: 0, background: [] });
});

test('in flight: two launches with one ended are one; a notice without an end status does not end a monitor', () => {
    assert.deepEqual(counting([shell('t1'), started('t1', 'b1'), launch('t2', 'Monitor', { command: 'tail -f x' }), started('t2', 'm1'), notice('b1', 't1', 'completed')]), { kind: 'in-flight', count: 1, background: [] });
    assert.deepEqual(counting([launch('t2', 'Monitor', {}), started('t2', 'm1'), line({ type: 'user', message: { content: '<task-notification>\n<task-id>m1</task-id>\n<summary>event</summary>\n</task-notification>' } })]), { kind: 'in-flight', count: 1, background: [] });
});

test('in flight: an async agent is in flight until its notice; a foreground agent ended with its result', () => {
    const asyncAgent = line({ type: 'user', toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'a1' }, message: { content: [{ type: 'tool_result', tool_use_id: 'g1', content: [{ type: 'text', text: 'Async agent launched successfully.' }] }] } });
    assert.equal(counting([launch('g1', 'Agent', { prompt: 'x' }), asyncAgent]).kind, 'in-flight');
    assert.deepEqual(counting([launch('g1', 'Agent', {}), asyncAgent, notice('a1', 'g1', 'completed')]), { kind: 'in-flight', count: 0, background: [] });
    const done = line({ type: 'user', toolUseResult: { status: 'completed' }, message: { content: [{ type: 'tool_result', tool_use_id: 'g2', content: 'the answer' }] } });
    assert.deepEqual(counting([launch('g2', 'Task', {}), done]), { kind: 'in-flight', count: 0, background: [] });
});

test('in flight: a launch the tail cuts is not seen (the count is what shows) when the tail is whole; a tail that does not parse is unknown', () => {
    assert.deepEqual(counting(['{"type":"assistant","mes', notice('b0', 'gone', 'completed'), shell('t3'), started('t3', 'b3')]), { kind: 'in-flight', count: 1, background: [] });
    assert.deepEqual(counting([]), { kind: 'in-flight', count: 0, background: [] });
    assert.equal(counting(['not json', '{broken']).kind, 'unknown');
});

test('in flight: a truncated tail whose notice ends a launch it never saw is unknown (the launch may lie before the tail); the same tail untruncated counts', () => {
    const cut = ['{"type":"assistant","mes', notice('b0', 'gone', 'completed'), shell('t3'), started('t3', 'b3')];
    assert.deepEqual(counting(cut, false), { kind: 'in-flight', count: 1, background: [] });
    assert.equal(counting(cut, true).kind, 'unknown');
    assert.deepEqual(counting([notice('b0', null, 'completed')], true).kind, 'unknown', 'a notice with no launch at all');
});

test('in flight: a truncated tail whose notices all end launches it saw, or end nothing, is still counted', () => {
    assert.deepEqual(counting([shell('t1'), started('t1', 'b1'), notice('b1', 't1', 'completed'), shell('t2'), started('t2', 'b2')], true), { kind: 'in-flight', count: 1, background: [] });
    assert.deepEqual(counting([launch('t2', 'Monitor', {}), started('t2', 'm1'), line({ type: 'user', message: { content: '<task-notification>\n<task-id>m1</task-id>\n<summary>event</summary>\n</task-notification>' } })], true), { kind: 'in-flight', count: 1, background: [] });
});

test('in flight: a sidechain launch and a quoted notice in an assistant row do not count', () => {
    assert.deepEqual(counting([line({ type: 'assistant', isSidechain: true, message: { content: [{ type: 'tool_use', id: 's', name: 'Monitor', input: {} }] } })]), { kind: 'in-flight', count: 0, background: [] });
    assert.deepEqual(counting([shell('t1'), started('t1', 'b1'), line({ type: 'assistant', message: { content: [{ type: 'text', text: '<task-notification><task-id>b1</task-id><status>completed</status></task-notification>' }] } })]), { kind: 'in-flight', count: 1, background: [] });
});

const queued = (task: string, tool: string | null, status: string): string => line({ type: 'queue-operation', operation: 'enqueue', timestamp: '2026-10-08T10:05:00.000Z', sessionId: 's', content: `<task-notification>\n<task-id>${task}</task-id>\n${tool === null ? '' : `<tool-use-id>${tool}</tool-use-id>\n`}<status>${status}</status>\n<summary>x</summary>\n</task-notification>` });

test('in flight: a notice queued as a queue-operation ends the launch it names, as a delivered user row does', () => {
    assert.deepEqual(counting([shell('t1'), started('t1', 'b1'), queued('b1', 't1', 'completed')]), { kind: 'in-flight', count: 0, background: [] });
    assert.deepEqual(counting([shell('t1'), started('t1', 'b1'), queued('b1', null, 'failed')]), { kind: 'in-flight', count: 0, background: [] }, 'by the task id alone');
    assert.deepEqual(counting([shell('t1'), started('t1', 'b1'), queued('b1', 't1', 'Goal check-in')]), { kind: 'in-flight', count: 1, background: [] }, 'a queued notice with no ending status ends nothing');
});

test('in flight: a notice queued and then delivered is one end: the delivery is seen, also in a truncated tail', () => {
    const cut = [shell('t1'), started('t1', 'b1'), queued('b1', 't1', 'completed'), notice('b1', 't1', 'completed')];
    assert.deepEqual(counting(cut, true), { kind: 'in-flight', count: 0, background: [] });
});

const monitorAt = (id: string, iso: string, input: object): string => line({ type: 'assistant', isSidechain: false, timestamp: iso, message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Monitor', input }] } });
const wordsAt = (iso: string): string => line({ type: 'assistant', isSidechain: false, timestamp: iso, message: { role: 'assistant', content: [{ type: 'text', text: 'Still watching.' }] } });

test('in flight: a Monitor past its own timeout_ms (against the newest row of the tail) has ended; within it, it is in flight', () => {
    assert.deepEqual(counting([monitorAt('m1', '2026-10-08T10:00:00.000Z', { command: 'tail -f x', timeout_ms: 3_600_000 }), wordsAt('2026-10-08T11:00:30.000Z')]), { kind: 'in-flight', count: 0, background: [] });
    assert.deepEqual(counting([monitorAt('m1', '2026-10-08T10:00:00.000Z', { command: 'tail -f x', timeout_ms: 3_600_000 }), wordsAt('2026-10-08T10:59:00.000Z')]), { kind: 'in-flight', count: 1, background: [] });
});

test('in flight: a Monitor without a timeout_ms (persistent) does not expire by time; an expired Monitor is dropped and a live shell in the same tail still counts', () => {
    assert.deepEqual(counting([monitorAt('m1', '2026-10-08T10:00:00.000Z', { command: 'tail -f x', persistent: true }), wordsAt('2026-10-09T10:00:00.000Z')]), { kind: 'in-flight', count: 1, background: [] });
    assert.deepEqual(counting([monitorAt('m2', '2026-10-08T10:00:00.000Z', { command: 'x', timeout_ms: 60_000 }), shell('t1'), wordsAt('2026-10-08T12:00:00.000Z')]), { kind: 'in-flight', count: 1, background: [] });
});

test('in flight: the default split separates; a kind that cannot tell counts every launch as foreground', () => {
    assert.deepEqual(CLAUDE_SPLIT, { kind: 'separates' });
    assert.deepEqual(claudeInFlight([named('t1', 'watch the build'), started('t1', 'b1')]), { kind: 'in-flight', count: 0, background: [{ tool: 'Bash', label: 'watch the build' }] });
    assert.deepEqual(claudeInFlight([named('t1', 'watch the build'), started('t1', 'b1')], false, { kind: 'foreground-only', why: 'codex-cells' }), { kind: 'in-flight', count: 1, background: [] });
});

test('in flight, separates: a background shell is listed by its description, not counted', () => {
    assert.deepEqual(claudeInFlight([named('t1', 'watch the build'), started('t1', 'b1')], false, separates), { kind: 'in-flight', count: 0, background: [{ tool: 'Bash', label: 'watch the build' }] });
});

test('in flight, separates: a Monitor and a background Agent are listed by their tool and description', () => {
    const asyncAgent = line({ type: 'user', toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'a1' }, message: { content: [{ type: 'tool_result', tool_use_id: 'g1', content: [{ type: 'text', text: 'Async agent launched successfully.' }] }] } });
    assert.deepEqual(claudeInFlight([launch('t2', 'Monitor', { command: 'tail -f x', description: 'tail the log' }), started('t2', 'm1')], false, separates), { kind: 'in-flight', count: 0, background: [{ tool: 'Monitor', label: 'tail the log' }] });
    assert.deepEqual(claudeInFlight([launch('g1', 'Agent', { prompt: 'x', description: 'review the diff' }), asyncAgent], false, separates), { kind: 'in-flight', count: 0, background: [{ tool: 'Agent', label: 'review the diff' }] });
});

test('in flight, separates: a foreground subagent that returned its result is not listed', () => {
    const returned = line({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'g2', content: [{ type: 'text', text: 'finished' }] }] } });
    assert.deepEqual(claudeInFlight([launch('g2', 'Task', {}), returned], false, separates), { kind: 'in-flight', count: 0, background: [] });
});

test('in flight, separates: a launch with no description, or a blank one, is labelled by its tool', () => {
    assert.deepEqual(claudeInFlight([shell('t1'), started('t1', 'b1')], false, separates), { kind: 'in-flight', count: 0, background: [{ tool: 'Bash', label: 'Bash' }] });
    assert.deepEqual(claudeInFlight([named('t1', '   '), started('t1', 'b1')], false, separates), { kind: 'in-flight', count: 0, background: [{ tool: 'Bash', label: 'Bash' }] });
});

test('in flight, separates: an ended launch is not listed; the items keep launch order', () => {
    assert.deepEqual(claudeInFlight([named('t1', 'first'), started('t1', 'b1'), notice('b1', 't1', 'completed')], false, separates), { kind: 'in-flight', count: 0, background: [] });
    assert.deepEqual(claudeInFlight([named('t1', 'first'), started('t1', 'b1'), named('t2', 'second'), started('t2', 'b2'), named('t3', 'third'), started('t3', 'b3'), notice('b2', 't2', 'completed')], false, separates), { kind: 'in-flight', count: 0, background: [{ tool: 'Bash', label: 'first' }, { tool: 'Bash', label: 'third' }] });
});

test('in flight, separates: an expired Monitor is not listed, a live one is', () => {
    assert.deepEqual(claudeInFlight([monitorAt('m1', '2026-10-08T10:00:00.000Z', { command: 'tail -f x', description: 'old', timeout_ms: 60_000 }), wordsAt('2026-10-08T12:00:00.000Z')], false, separates), { kind: 'in-flight', count: 0, background: [] });
    assert.deepEqual(claudeInFlight([monitorAt('m1', '2026-10-08T10:00:00.000Z', { command: 'tail -f x', description: 'live', persistent: true }), wordsAt('2026-10-08T12:00:00.000Z')], false, separates), { kind: 'in-flight', count: 0, background: [{ tool: 'Monitor', label: 'live' }] });
});

test('in flight, separates: a truncated tail with an unseen notice is unknown in both modes', () => {
    const cut = ['{"type":"assistant","mes', notice('b0', 'gone', 'completed'), named('t3', 'live'), started('t3', 'b3')];
    assert.equal(claudeInFlight(cut, true, separates).kind, 'unknown');
    assert.equal(claudeInFlight(cut, true, CLAUDE_SPLIT).kind, 'unknown');
    assert.deepEqual(claudeInFlight(cut, false, separates), { kind: 'in-flight', count: 0, background: [{ tool: 'Bash', label: 'live' }] });
});
