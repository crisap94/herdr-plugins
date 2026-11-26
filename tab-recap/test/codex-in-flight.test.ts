import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexTranscripts } from '#src/adapters/transcripts/codex/transcripts.ts';
import type { InFlightResult } from '@stateforge-labs/session-ledger';
import { splitReason } from '@stateforge-labs/session-ledger';
import { parseText } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { runningOf } from '@stateforge-labs/session-ledger';
import { codexInFlight, fsPathOf } from './fakes/transcript-lines.ts';

const fixture = (name: string): readonly string[] => readFileSync(join(import.meta.dirname, 'fixtures', 'codex-inflight', name), 'utf8').trim().split('\n');
const result = (name: string): InFlightResult => codexInFlight(fixture(name), false);

test('codex: all its in-flight work is foreground, and the capability says so by name', () => {
    const { split } = new CodexTranscripts(fsPathOf(tmpdir())).inFlight;
    if (split.kind !== 'foreground-only') throw new Error('codex cannot tell its background work apart, so it must declare foreground-only');
    assert.equal(split.why, 'codex-cells');
    assert.equal(splitReason(split.why, must(parseText('codex'))), 'codex cannot tell background work that survives a compaction');
    assert.deepEqual(codexInFlight(fixture('open-call.jsonl'), false), { kind: 'in-flight', count: runningOf(1), background: [] }, 'the work is counted as foreground, not listed');
});

test('codex: an exec with no output at end of file is one in flight', () => {
    assert.deepEqual(result('open-call.jsonl'), { kind: 'in-flight', count: runningOf(1), background: [] });
});

test('codex: a yielded cell is in flight until a wait on it returns Script completed; a wait that returns running does not end it', () => {
    const lines = fixture('wait-sequence.jsonl');
    assert.deepEqual(codexInFlight(lines.slice(0, 5), false), { kind: 'in-flight', count: runningOf(1), background: [] });
    assert.deepEqual(codexInFlight(lines, false), { kind: 'in-flight', count: runningOf(0), background: [] });
    assert.deepEqual(result('yield-no-wait.jsonl'), { kind: 'in-flight', count: runningOf(1), background: [] });
});

test('codex: a turn ended by task_complete or turn_aborted with no open call is not in flight', () => {
    assert.deepEqual(result('complete-exec.jsonl'), { kind: 'in-flight', count: runningOf(0), background: [] });
    assert.deepEqual(result('turn-ended.jsonl'), { kind: 'in-flight', count: runningOf(0), background: [] });
});

test('codex: an open call from an earlier turn is ignored after the latest turn starts and closes its own call', () => {
    const lines = [
        JSON.stringify({ type: 'event_msg', payload: { type: 'task_started', turn_id: 'turn-1' } }),
        JSON.stringify({ type: 'response_item', payload: { type: 'function_call', call_id: 'call-old', name: 'exec', arguments: 'x' } }),
        JSON.stringify({ type: 'event_msg', payload: { type: 'task_started', turn_id: 'turn-2' } }),
        JSON.stringify({ type: 'response_item', payload: { type: 'function_call', call_id: 'call-new', name: 'exec', arguments: 'x' } }),
        JSON.stringify({ type: 'response_item', payload: { type: 'function_call_output', call_id: 'call-new', output: 'done' } }),
    ];
    assert.deepEqual(codexInFlight(lines, false), { kind: 'in-flight', count: runningOf(0), background: [] });
});

test('codex: a truncated tail with no task_started and an open call is unknown', () => {
    assert.deepEqual(codexInFlight(fixture('open-call.jsonl').slice(1), true), { kind: 'unknown', why: { why: 'unreadable', detail: 'the truncated rollout tail contains an open call' } });
});

test('codex: a truncated tail with a task start and an open call is unknown', () => {
    assert.deepEqual(codexInFlight(fixture('open-call.jsonl'), true), { kind: 'unknown', why: { why: 'unreadable', detail: 'the truncated rollout tail contains an open call' } });
});

test('codex: an open turn with no call is not in flight', () => {
    assert.deepEqual(result('open-turn.jsonl'), { kind: 'in-flight', count: runningOf(0), background: [] });
});
