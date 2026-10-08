import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractClaude } from '#src/adapters/claude-rows.ts';
import { codexMarks } from '#src/adapters/codex-marks.ts';
import { extractCodex } from '#src/adapters/codex-transcripts.ts';
import { OpencodeTranscripts } from '#src/adapters/opencode-transcripts.ts';
import { UNREAD } from '#src/ports/transcripts.ts';
import { opencodeFixture } from '#test/opencode-fixture.ts';

const linesOf = (name: string): string[] => readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8').split('\n').filter((line) => line !== '');

test('claude: compact_boundary carries what compactMetadata says (rows recorded from a real /compact, private text replaced)', () => {
    assert.deepEqual(extractClaude(linesOf('claude-compact-boundary.jsonl')).marks, [{ kind: 'compacted', at: Date.parse('2026-10-07T16:38:09.490Z'), tokensBefore: 39532, tokensAfter: 3057, tookMs: 15588, trigger: 'manual' }]);
});

test('claude: compactMetadata.trigger is the agent\'s own word; anything but manual or auto is left out', () => {
    assert.deepEqual(extractClaude([boundary({ trigger: 'auto' }), boundary({ trigger: 'scheduled' })]).marks?.map((mark) => mark.trigger), ['auto', undefined]);
});

const boundary = (metadata: object | undefined): string => JSON.stringify({ type: 'system', subtype: 'compact_boundary', timestamp: '2026-10-07T16:38:09.490Z', ...(metadata === undefined ? {} : { compactMetadata: metadata }) });
const count = (total: number): string => JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { total_tokens: total } } } });

test('claude: a Claude version that drops compactMetadata still confirms, with no numbers; a number that is not one is left out', () => {
    assert.deepEqual(extractClaude([boundary(undefined)]).marks, [{ kind: 'compacted', at: Date.parse('2026-10-07T16:38:09.490Z') }]);
    assert.deepEqual(extractClaude([boundary({ preTokens: 'many', postTokens: -1, durationMs: 4000 })]).marks?.map((mark) => [mark.tokensBefore, mark.tokensAfter, mark.tookMs]), [[undefined, undefined, 4000]]);
});

test('codex: before is the last token_count before the compacted row, after the first one after it (rows recorded from a real /compact)', () => {
    const lines = linesOf('codex-compacted.jsonl');
    const [mark] = extractCodex(lines).marks ?? [];
    assert.deepEqual(mark, { kind: 'compacted', at: Date.parse('2026-10-06T13:09:05.181Z'), tokensBefore: 17133, tokensAfter: 4617 });
});

test('codex: a compaction whose token_counts are not in the lines read has no numbers; two compactions pair with their own counts', () => {
    const compacted = JSON.stringify({ timestamp: '2026-10-06T13:09:05.181Z', type: 'compacted', payload: {} });
    assert.deepEqual(codexMarks([compacted]).map((mark) => [mark.tokensBefore, mark.tokensAfter]), [[undefined, undefined]]);
    assert.deepEqual(codexMarks([count(900), compacted, count(100), count(500), compacted, count(200)]).map((mark) => [mark.tokensBefore, mark.tokensAfter]), [[900, 100], [500, 200]]);
    assert.deepEqual(codexMarks(['not json', count(0), compacted]).map((mark) => mark.tokensBefore), [undefined]);
});

test('opencode: the compaction answer is a mark with the message\'s tokens and how long it took; a plain answer is none', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'recap-marks-'));
    try {
        const fixture = opencodeFixture(dir);
        const created = 1_790_000_009_000;
        fixture.add({ id: 'm1', session: 'ses_new', role: 'assistant', updated: 100, data: { time: { created: 1 } }, parts: [{ type: 'text', text: 'hello' }] });
        fixture.add({ id: 'm2', session: 'ses_new', role: 'assistant', updated: 120, data: { 'summary': true, mode: 'compaction', time: { created, completed: created + 7000 }, tokens: { input: 900, output: 80, cache: { read: 100, write: 20 } } }, parts: [{ type: 'text', text: '## Goal\nRename.' }] });
        fixture.close();
        const reader = new OpencodeTranscripts(fixture.db);
        const chunk = await reader.read(`${fixture.db}#ses_new`, UNREAD, 1 << 20);
        assert.ok(chunk.kind === 'chunk');
        assert.deepEqual(chunk.marks, [{ kind: 'compacted', at: created, tokensBefore: 1020, tookMs: 7000 }]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
