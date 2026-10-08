import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claudeInFlight } from '#src/adapters/claude-in-flight.ts';

const line = (row: object): string => JSON.stringify(row);
const launch = (id: string, name: string, input: object = {}): string => line({ type: 'assistant', isSidechain: false, message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } });
const started = (id: string, task: string): string => line({ type: 'user', toolUseResult: { stdout: '', backgroundTaskId: task }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: `Command running in background with ID: ${task}. Output is being written to: /x/${task}.output.` }] } });
const notice = (task: string, tool: string | null, status: string): string => line({ type: 'user', origin: { kind: 'task-notification' }, message: { role: 'user', content: `<task-notification>\n<task-id>${task}</task-id>\n${tool === null ? '' : `<tool-use-id>${tool}</tool-use-id>\n`}<status>${status}</status>\n<summary>x</summary>\n</task-notification>` } });
const shell = (id: string): string => launch(id, 'Bash', { command: 'sleep 99', run_in_background: true });

test('in flight: a background shell with no end is one', () => {
    assert.deepEqual(claudeInFlight([shell('t1'), started('t1', 'b1')]), { kind: 'in-flight', count: 1 });
});

test('in flight: a completed, failed, killed or stopped notice ends it (by tool-use id, or by the task id its result stated)', () => {
    for (const status of ['completed', 'failed', 'killed', 'stopped']) {
        assert.deepEqual(claudeInFlight([shell('t1'), started('t1', 'b1'), notice('b1', 't1', status)]), { kind: 'in-flight', count: 0 }, status);
    }
    assert.deepEqual(claudeInFlight([shell('t1'), started('t1', 'b1'), notice('b1', null, 'killed')]), { kind: 'in-flight', count: 0 });
});

test('in flight: two launches with one ended are one; a notice without an end status does not end a monitor', () => {
    assert.deepEqual(claudeInFlight([shell('t1'), started('t1', 'b1'), launch('t2', 'Monitor', { command: 'tail -f x' }), started('t2', 'm1'), notice('b1', 't1', 'completed')]), { kind: 'in-flight', count: 1 });
    assert.deepEqual(claudeInFlight([launch('t2', 'Monitor', {}), started('t2', 'm1'), line({ type: 'user', message: { content: '<task-notification>\n<task-id>m1</task-id>\n<summary>event</summary>\n</task-notification>' } })]), { kind: 'in-flight', count: 1 });
});

test('in flight: an async agent is in flight until its notice; a foreground agent ended with its result', () => {
    const asyncAgent = line({ type: 'user', toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'a1' }, message: { content: [{ type: 'tool_result', tool_use_id: 'g1', content: [{ type: 'text', text: 'Async agent launched successfully.' }] }] } });
    assert.equal(claudeInFlight([launch('g1', 'Agent', { prompt: 'x' }), asyncAgent]).kind, 'in-flight');
    assert.deepEqual(claudeInFlight([launch('g1', 'Agent', {}), asyncAgent, notice('a1', 'g1', 'completed')]), { kind: 'in-flight', count: 0 });
    const done = line({ type: 'user', toolUseResult: { status: 'completed' }, message: { content: [{ type: 'tool_result', tool_use_id: 'g2', content: 'the answer' }] } });
    assert.deepEqual(claudeInFlight([launch('g2', 'Task', {}), done]), { kind: 'in-flight', count: 0 });
});

test('in flight: a launch the tail cuts is not seen (the count is what shows) when the tail is whole; a tail that does not parse is unknown', () => {
    assert.deepEqual(claudeInFlight(['{"type":"assistant","mes', notice('b0', 'gone', 'completed'), shell('t3'), started('t3', 'b3')]), { kind: 'in-flight', count: 1 });
    assert.deepEqual(claudeInFlight([]), { kind: 'in-flight', count: 0 });
    assert.equal(claudeInFlight(['not json', '{broken']).kind, 'unknown');
});

test('in flight: a truncated tail whose notice ends a launch it never saw is unknown (the launch may lie before the tail); the same tail untruncated counts', () => {
    const cut = ['{"type":"assistant","mes', notice('b0', 'gone', 'completed'), shell('t3'), started('t3', 'b3')];
    assert.deepEqual(claudeInFlight(cut, false), { kind: 'in-flight', count: 1 });
    assert.equal(claudeInFlight(cut, true).kind, 'unknown');
    assert.deepEqual(claudeInFlight([notice('b0', null, 'completed')], true).kind, 'unknown', 'a notice with no launch at all');
});

test('in flight: a truncated tail whose notices all end launches it saw, or end nothing, is still counted', () => {
    assert.deepEqual(claudeInFlight([shell('t1'), started('t1', 'b1'), notice('b1', 't1', 'completed'), shell('t2'), started('t2', 'b2')], true), { kind: 'in-flight', count: 1 });
    assert.deepEqual(claudeInFlight([launch('t2', 'Monitor', {}), started('t2', 'm1'), line({ type: 'user', message: { content: '<task-notification>\n<task-id>m1</task-id>\n<summary>event</summary>\n</task-notification>' } })], true), { kind: 'in-flight', count: 1 });
});

test('in flight: a sidechain launch and a quoted notice in an assistant row do not count', () => {
    assert.deepEqual(claudeInFlight([line({ type: 'assistant', isSidechain: true, message: { content: [{ type: 'tool_use', id: 's', name: 'Monitor', input: {} }] } })]), { kind: 'in-flight', count: 0 });
    assert.deepEqual(claudeInFlight([shell('t1'), started('t1', 'b1'), line({ type: 'assistant', message: { content: [{ type: 'text', text: '<task-notification><task-id>b1</task-id><status>completed</status></task-notification>' }] } })]), { kind: 'in-flight', count: 1 });
});

/** A notice as the transcript queues it: a `queue-operation` enqueue whose content is the notice (the user row that delivers it comes later). */
const queued = (task: string, tool: string | null, status: string): string => line({ type: 'queue-operation', operation: 'enqueue', timestamp: '2026-10-08T10:05:00.000Z', sessionId: 's', content: `<task-notification>\n<task-id>${task}</task-id>\n${tool === null ? '' : `<tool-use-id>${tool}</tool-use-id>\n`}<status>${status}</status>\n<summary>x</summary>\n</task-notification>` });

test('in flight: a notice queued as a queue-operation ends the launch it names, as a delivered user row does', () => {
    assert.deepEqual(claudeInFlight([shell('t1'), started('t1', 'b1'), queued('b1', 't1', 'completed')]), { kind: 'in-flight', count: 0 });
    assert.deepEqual(claudeInFlight([shell('t1'), started('t1', 'b1'), queued('b1', null, 'failed')]), { kind: 'in-flight', count: 0 }, 'by the task id alone');
    assert.deepEqual(claudeInFlight([shell('t1'), started('t1', 'b1'), queued('b1', 't1', 'Goal check-in')]), { kind: 'in-flight', count: 1 }, 'a queued notice with no ending status ends nothing');
});

test('in flight: a notice queued and then delivered is one end: the delivery is seen, also in a truncated tail', () => {
    const cut = [shell('t1'), started('t1', 'b1'), queued('b1', 't1', 'completed'), notice('b1', 't1', 'completed')];
    assert.deepEqual(claudeInFlight(cut, true), { kind: 'in-flight', count: 0 });
});

/** A row written at `iso`: a Monitor launch, or any other row (here, the agent's own words) that tells the time. */
const monitorAt = (id: string, iso: string, input: object): string => line({ type: 'assistant', isSidechain: false, timestamp: iso, message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Monitor', input }] } });
const wordsAt = (iso: string): string => line({ type: 'assistant', isSidechain: false, timestamp: iso, message: { role: 'assistant', content: [{ type: 'text', text: 'Still watching.' }] } });

test('in flight: a Monitor past its own timeout_ms (against the newest row of the tail) has ended; within it, it is in flight', () => {
    assert.deepEqual(claudeInFlight([monitorAt('m1', '2026-10-08T10:00:00.000Z', { command: 'tail -f x', timeout_ms: 3_600_000 }), wordsAt('2026-10-08T11:00:30.000Z')]), { kind: 'in-flight', count: 0 });
    assert.deepEqual(claudeInFlight([monitorAt('m1', '2026-10-08T10:00:00.000Z', { command: 'tail -f x', timeout_ms: 3_600_000 }), wordsAt('2026-10-08T10:59:00.000Z')]), { kind: 'in-flight', count: 1 });
});

test('in flight: a Monitor without a timeout_ms (persistent) does not expire by time; an expired Monitor is dropped and a live shell in the same tail still counts', () => {
    assert.deepEqual(claudeInFlight([monitorAt('m1', '2026-10-08T10:00:00.000Z', { command: 'tail -f x', persistent: true }), wordsAt('2026-10-09T10:00:00.000Z')]), { kind: 'in-flight', count: 1 });
    assert.deepEqual(claudeInFlight([monitorAt('m2', '2026-10-08T10:00:00.000Z', { command: 'x', timeout_ms: 60_000 }), shell('t1'), wordsAt('2026-10-08T12:00:00.000Z')]), { kind: 'in-flight', count: 1 });
});
