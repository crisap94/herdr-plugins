import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractClaude } from '#src/adapters/claude-transcripts.ts';
import { extractCodex } from '#src/adapters/codex-transcripts.ts';
import { renderExcerpt } from '#src/recap/application/excerpt.ts';

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

test('claude: prompts, replies and tool briefs — never thinking, tool results or meta', () => {
    const got = extractClaude([...claude, '{"type":"user","message":{"content":"half a li']);
    assert.deepEqual(got.entries, [
        { role: 'user', text: 'build a recap column' },
        { role: 'agent', text: 'On it.' },
        { role: 'tool', text: 'Bash: List files' },
    ]);
    assert.equal(got.title, 'herdr recap column');
    assert.equal(got.claudeRecap, 'Building the column.');
    assert.equal(got.lastPrompt, 'build a recap column');
});

test('codex: user/assistant messages and tool calls, without the injected context', () => {
    const rows = [
        { type: 'session_meta', payload: { cwd: '/repo' } },
        { type: 'response_item', payload: { type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'sys' }] } },
        { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>...' }] } },
        { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'fix the test' }] } },
        { type: 'response_item', payload: { type: 'function_call', name: 'shell', arguments: '{"command":"npm test"}' } },
        { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Fixed.' }] } },
    ].map((row) => JSON.stringify(row));
    const got = extractCodex(rows);
    assert.deepEqual(got.entries.map((entry) => entry.role), ['user', 'tool', 'agent']);
    assert.equal(got.lastPrompt, 'fix the test');
});

test('the excerpt collapses tool bursts and keeps the most recent text over budget', () => {
    const excerpt = renderExcerpt([
        { role: 'user', text: 'old '.repeat(50) },
        { role: 'tool', text: 'Read: a.ts' },
        { role: 'tool', text: 'Edit: a.ts' },
        { role: 'agent', text: 'done' },
    ], 60);
    assert.ok(excerpt.startsWith('[…earlier turns omitted…]'));
    assert.ok(excerpt.includes('TOOLS: Read: a.ts | Edit: a.ts'));
    assert.ok(excerpt.endsWith('AGENT: done'));
});
