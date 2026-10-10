import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexTranscripts } from '#src/adapters/codex-transcripts.ts';
import { CODEX_IN_FLIGHT_INITIAL_BYTES, codexInFlight } from '#src/adapters/codex-in-flight.ts';
import type { InFlightResult } from '#src/ports/transcripts.ts';

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

test('codex: a truncated tail with no task_started and an open call is unknown', () => {
    assert.deepEqual(codexInFlight(fixture('open-call.jsonl').slice(1), true), { kind: 'unknown', why: { why: 'unreadable', detail: 'the truncated rollout tail has an open call and no task start' } });
});

test('codex: an open turn with no call is not in flight', () => {
    assert.deepEqual(result('open-turn.jsonl'), { kind: 'in-flight', count: 0 });
});

test('codex: the reader doubles its budget until it reaches the last task start', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'recap-codex-flight-'));
    try {
        const path = join(dir, 'rollout.jsonl');
        const filler = '{"type":"event_msg","payload":{"type":"noise"}}\n';
        const middle = filler.repeat(Math.ceil((CODEX_IN_FLIGHT_INITIAL_BYTES + 1000) / Buffer.byteLength(filler)));
        writeFileSync(path, `{"type":"event_msg","payload":{"type":"task_started","turn_id":"turn-1"}}\n${middle}{"type":"response_item","payload":{"type":"function_call","call_id":"call-1","name":"sleep","arguments":"x"}}\n`);
        assert.deepEqual(await new CodexTranscripts(dir).inFlight.read(path, 1), { kind: 'in-flight', count: 1 });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
