import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexTranscripts } from '#src/adapters/transcripts/codex/transcripts.ts';
import { tailSpan } from '#src/adapters/transcripts/jsonl.ts';
import { sourcePathOf } from '@stateforge-labs/session-ledger';
import { countOf } from '@stateforge-labs/session-ledger';
import { runningOf } from '@stateforge-labs/session-ledger';
import { fsPathOf } from '#test/fakes/transcript-lines.ts';

test('codex: a rollout between 2 and 16 MiB doubles its tail budget and counts an open call', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'recap-codex-flight-'));
    try {
        const path = join(dir, 'rollout.jsonl');
        const filler = '{"type":"event_msg","payload":{"type":"noise"}}\n';
        const targetBytes = 3 * 1024 * 1024;
        const middle = filler.repeat(Math.ceil(targetBytes / Buffer.byteLength(filler)));
        writeFileSync(path, `{"type":"event_msg","payload":{"type":"task_started","turn_id":"turn-1"}}\n${middle}{"type":"response_item","payload":{"type":"function_call","call_id":"call-1","name":"sleep","arguments":"x"}}\n`);
        const budgets: number[] = [];
        const reader = new CodexTranscripts(fsPathOf(dir), (source, bytes) => { budgets.push(bytes); return tailSpan(source, bytes); });
        assert.deepEqual(await reader.inFlight.read(sourcePathOf(path), countOf(1)), { kind: 'in-flight', count: runningOf(1), background: [] });
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
        const answer = await new CodexTranscripts(fsPathOf(dir)).inFlight.read(sourcePathOf(path), countOf(1));
        assert.equal(answer.kind, 'unknown');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
