import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexTranscripts } from '#src/adapters/codex-transcripts.ts';
import { codexInFlight } from '#src/adapters/codex-in-flight.ts';
import type { InFlightResult } from '#src/ports/transcripts.ts';
import { tailOf } from '#src/adapters/jsonl.ts';

const fixture = (name: string): readonly string[] => readFileSync(join(import.meta.dirname, 'fixtures', 'codex-inflight', name), 'utf8').trim().split('\n');
const result = (name: string): InFlightResult => codexInFlight(fixture(name), false);

test('codex: an exec with no output at end of file is one in flight', () => {
    assert.deepEqual(result('open-call.jsonl'), { kind: 'in-flight', count: 1 });
});

test('codex: a yielded cell is in flight until a wait on it returns Script completed; a wait that returns running does not end it', () => {
    const lines = fixture('wait-sequence.jsonl');
    assert.deepEqual(codexInFlight(lines.slice(0, 5), false), { kind: 'in-flight', count: 1 });
    assert.deepEqual(codexInFlight(lines, false), { kind: 'in-flight', count: 0 });
    assert.deepEqual(result('yield-no-wait.jsonl'), { kind: 'in-flight', count: 1 });
});

test('codex: a turn ended by task_complete or turn_aborted with no open call is not in flight', () => {
    assert.deepEqual(result('complete-exec.jsonl'), { kind: 'in-flight', count: 0 });
    assert.deepEqual(result('turn-ended.jsonl'), { kind: 'in-flight', count: 0 });
});

test('codex: an open call from an earlier turn is ignored after the latest turn starts and closes its own call', () => {
    const lines = [
        JSON.stringify({ type: 'event_msg', payload: { type: 'task_started', turn_id: 'turn-1' } }),
        JSON.stringify({ type: 'response_item', payload: { type: 'function_call', call_id: 'call-old', name: 'exec', arguments: 'x' } }),
        JSON.stringify({ type: 'event_msg', payload: { type: 'task_started', turn_id: 'turn-2' } }),
        JSON.stringify({ type: 'response_item', payload: { type: 'function_call', call_id: 'call-new', name: 'exec', arguments: 'x' } }),
        JSON.stringify({ type: 'response_item', payload: { type: 'function_call_output', call_id: 'call-new', output: 'done' } }),
    ];
    assert.deepEqual(codexInFlight(lines, false), { kind: 'in-flight', count: 0 });
});

test('codex: a truncated tail with no task_started and an open call is unknown', () => {
    assert.deepEqual(codexInFlight(fixture('open-call.jsonl').slice(1), true), { kind: 'unknown', why: { why: 'unreadable', detail: 'the truncated rollout tail contains an open call' } });
});

test('codex: a truncated tail with a task start and an open call is unknown', () => {
    assert.deepEqual(codexInFlight(fixture('open-call.jsonl'), true), { kind: 'unknown', why: { why: 'unreadable', detail: 'the truncated rollout tail contains an open call' } });
});

test('codex: an open turn with no call is not in flight', () => {
    assert.deepEqual(result('open-turn.jsonl'), { kind: 'in-flight', count: 0 });
});

test('codex: a rollout between 2 and 16 MiB doubles its tail budget and counts an open call', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'recap-codex-flight-'));
    try {
        const path = join(dir, 'rollout.jsonl');
        const filler = '{"type":"event_msg","payload":{"type":"noise"}}\n';
        const targetBytes = 3 * 1024 * 1024;
        const middle = filler.repeat(Math.ceil(targetBytes / Buffer.byteLength(filler)));
        writeFileSync(path, `{"type":"event_msg","payload":{"type":"task_started","turn_id":"turn-1"}}\n${middle}{"type":"response_item","payload":{"type":"function_call","call_id":"call-1","name":"sleep","arguments":"x"}}\n`);
        const budgets: number[] = [];
        const reader = new CodexTranscripts(dir, (source, bytes) => { budgets.push(bytes); return tailOf(source, bytes); });
        assert.deepEqual(await reader.inFlight.read(path, 1), { kind: 'in-flight', count: 1 });
        assert.deepEqual(budgets, [2 * 1024 * 1024, 4 * 1024 * 1024]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('codex: an open call in a rollout over 16 MiB is unknown at the reader bound', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'recap-codex-bound-'));
    try {
        const path = join(dir, 'rollout.jsonl');
        const filler = '{"type":"event_msg","payload":{"type":"noise"}}\n';
        const middle = filler.repeat(Math.ceil((17 * 1024 * 1024) / Buffer.byteLength(filler)));
        writeFileSync(path, `{"type":"event_msg","payload":{"type":"task_started","turn_id":"turn-1"}}\n${middle}{"type":"response_item","payload":{"type":"function_call","call_id":"call-1","name":"sleep","arguments":"x"}}\n`);
        const answer = await new CodexTranscripts(dir).inFlight.read(path, 1);
        assert.equal(answer.kind, 'unknown');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
