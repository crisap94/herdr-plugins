import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractClaude } from '#src/adapters/claude-transcripts.ts';
import { extractCodex } from '#src/adapters/codex-transcripts.ts';

const claude = [
    { type: 'ai-title', aiTitle: 'herdr recap column' },
    { type: 'user', message: { content: 'build a recap column' } },
    { type: 'user', isMeta: true, message: { content: 'meta noise' } },
    { type: 'user', message: { content: '<command-name>/clear</command-name>' } },
    { type: 'user', message: { content: [{ type: 'tool_result', content: 'huge output' }] } },
    { type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'hidden' }, { type: 'text', text: 'On it.' }, { type: 'tool_use', name: 'Bash', input: { command: 'ls -la', description: 'List files' } }] } },
    { type: 'system', subtype: 'away_summary', content: 'Building the column.' },
    { type: 'last-prompt', lastPrompt: 'build a recap column' },
].map((row) => JSON.stringify(row));

const at = (iso: string): number => Date.parse(iso);

test('claude: prompts, replies and tool calls — never thinking, tool results or meta — each with its time', () => {
    const got = extractClaude([...claude, '{"type":"user","message":{"content":"half a li']);
    assert.deepEqual(got.entries, [
        { role: 'user', text: 'build a recap column' },
        { role: 'agent', text: 'On it.' },
        { role: 'tool', text: '', kind: 'read', what: 'List files' },
    ]);
    assert.equal(got.title, 'herdr recap column');
    assert.equal(got.claudeRecap, 'Building the column.');
    assert.equal(got.lastPrompt, 'build a recap column');
    assert.deepEqual(got.notes, [{ kind: 'away_summary', at: null, text: 'Building the column.' }]);
    const timed = extractClaude([JSON.stringify({ type: 'user', timestamp: '2026-10-06T03:00:00.000Z', message: { content: 'hello' } })]);
    assert.deepEqual(timed.entries, [{ role: 'user', text: 'hello', at: at('2026-10-06T03:00:00.000Z') }]);
});

test('codex: user/assistant messages and tool calls, without the injected context', () => {
    const rows = [
        { type: 'session_meta', payload: { cwd: '/repo' } },
        { type: 'response_item', payload: { type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'sys' }] } },
        { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>...' }] } },
        { timestamp: '2026-09-21T04:32:19.079Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'fix the test' }] } },
        { type: 'response_item', payload: { type: 'function_call', name: 'shell', arguments: '{"command":"npm test"}' } },
        { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Fixed.' }] } },
    ].map((row) => JSON.stringify(row));
    const got = extractCodex(rows);
    assert.deepEqual(got.entries.map((entry) => entry.role), ['user', 'tool', 'agent']);
    assert.equal(got.entries[0]?.at, at('2026-09-21T04:32:19.079Z'));
    assert.equal(got.lastPrompt, 'fix the test');
});
