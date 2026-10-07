import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractClaude } from '#src/adapters/claude-rows.ts';
import { extractCodex } from '#src/adapters/codex-transcripts.ts';
import { verdictOf } from '#src/recap/application/compaction-outcome.ts';

const row = (fields: Record<string, unknown>): string => JSON.stringify({ timestamp: '2026-10-07T10:00:05Z', ...fields });
const AT = Date.parse('2026-10-07T10:00:05Z');

test('claude: a compact_boundary row is a compaction; an `Error during compaction` local command is a failure; ordinary rows are neither', () => {
    const { marks } = extractClaude([
        row({ type: 'user', message: { content: 'hello' } }),
        row({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'manual', preTokens: 100 } }),
        row({ type: 'system', subtype: 'local_command', content: '<local-command-stderr>Error during compaction: summarization produced empty response</local-command-stderr>' }),
        row({ type: 'user', message: { content: '<local-command-stderr>Error during compaction: x</local-command-stderr>' } }),
        row({ type: 'assistant', message: { content: [{ type: 'text', text: 'Error during compaction would be a funny thing to say' }] } }),
        'not json',
    ]);
    assert.deepEqual(marks, [{ kind: 'compacted', at: AT, tokensBefore: 100 }, { kind: 'compaction-failed', at: AT }, { kind: 'compaction-failed', at: AT }]);
});

test('codex: a `compacted` row is a compaction', () => {
    const { marks } = extractCodex([row({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ text: 'hi' }] } }), row({ type: 'compacted', payload: { message: '' } })]);
    assert.deepEqual(marks, [{ kind: 'compacted', at: AT }]);
});

test('the verdict: the newest mark from the command on wins; none, older or undated is unconfirmed', () => {
    const since = AT - 1000;
    assert.equal(verdictOf([], since), 'unconfirmed');
    assert.equal(verdictOf([{ kind: 'compacted', at: since - 1 }], since), 'unconfirmed');
    assert.equal(verdictOf([{ kind: 'compacted', at: null }], since), 'unconfirmed');
    assert.equal(verdictOf([{ kind: 'compacted', at: AT }], since), 'compacted');
    assert.equal(verdictOf([{ kind: 'compaction-failed', at: AT }], since), 'failed');
    assert.equal(verdictOf([{ kind: 'compaction-failed', at: AT }, { kind: 'compacted', at: AT + 1 }], since), 'compacted', 'a retry that worked');
});
