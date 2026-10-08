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

test('in flight: a launch the tail cuts is not seen (the count is what shows); a tail that does not parse is unknown', () => {
    assert.deepEqual(claudeInFlight(['{"type":"assistant","mes', notice('b0', 'gone', 'completed'), shell('t3'), started('t3', 'b3')]), { kind: 'in-flight', count: 1 });
    assert.deepEqual(claudeInFlight([]), { kind: 'in-flight', count: 0 });
    assert.equal(claudeInFlight(['not json', '{broken']).kind, 'unknown');
});

test('in flight: a sidechain launch and a quoted notice in an assistant row do not count', () => {
    assert.deepEqual(claudeInFlight([line({ type: 'assistant', isSidechain: true, message: { content: [{ type: 'tool_use', id: 's', name: 'Monitor', input: {} }] } })]), { kind: 'in-flight', count: 0 });
    assert.deepEqual(claudeInFlight([shell('t1'), started('t1', 'b1'), line({ type: 'assistant', message: { content: [{ type: 'text', text: '<task-notification><task-id>b1</task-id><status>completed</status></task-notification>' }] } })]), { kind: 'in-flight', count: 1 });
});
