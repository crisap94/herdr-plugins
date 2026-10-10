import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractClaude } from '#src/adapters/claude-transcripts.ts';
import { extractCodex } from '#src/adapters/codex-transcripts.ts';
import { OpencodeTranscripts } from '#src/adapters/opencode-transcripts.ts';
import { execCalls } from '#src/adapters/codex-tool-calls.ts';
import { claudeNamedCall as namedCall } from '#src/adapters/claude-tool-calls.ts';
import { isPlainRead } from '#src/adapters/tool-calls.ts';
import { touchedFiles } from '#src/recap/application/lane-hints.ts';
import { UNREAD } from '#src/ports/transcripts.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { opencodeFixture } from '#test/opencode-fixture.ts';

const rows = (list: readonly object[]): string[] => list.map((row) => JSON.stringify(row));
const at = (iso: string): number => Date.parse(iso);

test('claude: a prompt typed while the agent was busy is a queued user entry, in order, with its time', () => {
    const got = extractClaude(rows([
        { type: 'user', timestamp: '2026-10-06T03:00:00.000Z', message: { content: 'start the migration' } },
        { type: 'attachment', attachment: { type: 'queued_command', prompt: 'also update the README', commandMode: 'prompt', origin: { kind: 'human' }, timestamp: '2026-10-06T03:01:00.000Z' } },
        { type: 'attachment', attachment: { type: 'queued_command', prompt: '<task-notification>a task ended</task-notification>', origin: { kind: 'task-notification' }, timestamp: '2026-10-06T03:02:00.000Z' } },
        { type: 'attachment', attachment: { type: 'queued_command', prompt: '<task-notification>mislabelled</task-notification>', origin: { kind: 'human' } } },
        { type: 'attachment', attachment: { type: 'prompt_snapshot', systemPrompt: ['x'] } },
    ]));
    assert.deepEqual(got.entries, [
        { role: 'user', text: 'start the migration', at: at('2026-10-06T03:00:00Z') },
        { role: 'user', text: 'also update the README', queued: true, at: at('2026-10-06T03:01:00Z') },
    ]);
});

test('claude: an interruption marker is not a prompt', () => {
    const got = extractClaude(rows([
        { type: 'user', message: { content: [{ type: 'text', text: '[Request interrupted by user]' }] } },
        { type: 'user', message: { content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }] } },
        { type: 'user', message: { content: 'no, use the other table' } },
    ]));
    assert.deepEqual(got.entries.map((entry) => entry.text), ['no, use the other table']);
});

test('claude: the away summary and the compaction summary are notes with their times, and the compaction is not a user turn', () => {
    const got = extractClaude(rows([
        { type: 'system', subtype: 'away_summary', content: 'Moving the cart to the new API; tests are next.', timestamp: '2026-10-06T03:05:00.000Z' },
        { type: 'user', 'isCompactSummary': true, timestamp: '2026-10-06T03:06:00.000Z', message: { content: 'This session is being continued from a previous conversation.\n\nSummary:\n1. Cart work' } },
    ]));
    assert.deepEqual(got.notes, [
        { kind: 'away_summary', at: at('2026-10-06T03:05:00Z'), text: 'Moving the cart to the new API; tests are next.' },
        { kind: 'compaction', at: at('2026-10-06T03:06:00Z'), text: 'This session is being continued from a previous conversation.\n\nSummary:\n1. Cart work' },
    ]);
    assert.deepEqual(got.entries, []);
});

const call = (name: string, input: object): object => ({ type: 'tool_use', name, input });

test('claude: tool calls have a kind — shell with its command and description, edits with the path, web, agent; plain reads are reads', () => {
    const got = extractClaude(rows([{ type: 'assistant', timestamp: '2026-10-06T03:00:00.000Z', message: { content: [
        call('Bash', { command: 'npm test -- cart', description: 'Run the cart tests' }),
        call('Bash', { command: 'cat src/cart.ts' }),
        call('Edit', { file_path: 'src/cart.ts', old_string: 'a', new_string: 'b' }),
        call('Write', { file_path: 'src/totals.ts', content: 'x' }),
        call('Read', { file_path: 'src/a.ts' }),
        call('WebSearch', { query: 'iso 8601 zone' }),
        call('Agent', { description: 'Explore the cart', prompt: 'long long' }),
        call('mcp__x__thing', { query: 'q' }),
    ] } }]));
    assert.deepEqual(got.entries.map((entry) => [entry.kind, entry.text, entry.what]), [
        ['shell', '', 'Run the cart tests'], ['read', 'cat src/cart.ts', undefined], ['edit', 'src/cart.ts', undefined], ['edit', 'src/totals.ts', undefined],
        ['read', 'src/a.ts', undefined], ['web', 'iso 8601 zone', undefined], ['agent', 'Explore the cart', undefined], ['other', 'mcp__x__thing: q', undefined],
    ]);
    assert.deepEqual(touchedFiles(got.entries), ['src/cart.ts', 'src/totals.ts']);
});

test('shell reads: only commands that look and never write', () => {
    for (const read of ['cat a.ts', 'sed -n 1,20p a.ts', 'rg -n foo src', 'ls -la', 'head -5 x', 'find . -name "*.ts"', 'wc -l a']) {
        assert.equal(isPlainRead(read), true, read);
    }
    for (const write of ['cat a > b', 'rg x | tee out', 'sed -i s/a/b/ f', 'git status', 'npm test', 'ls && rm -rf x > /dev/null']) {
        assert.equal(isPlainRead(write), false, write);
    }
    assert.equal(namedCall('Bash', { command: `echo ${'x'.repeat(400)}` }).text.length, 64, 'a command is clipped to 64');
    assert.deepEqual(namedCall('Bash', { command: 'echo hi', description: 'Say hi' }), { kind: 'shell', text: '', what: 'Say hi' }, 'a described command is sent as its description alone');
});

const exec = (input: string): string => JSON.stringify({ timestamp: '2026-09-21T04:32:19.079Z', type: 'response_item', payload: { type: 'custom_tool_call', status: 'completed', name: 'exec', input } });

test('codex: `exec` JavaScript is decoded — commands as shell calls, patches as one edit per file, web as web; never the wrapping JS', () => {
    const got = extractCodex([
        exec('text(await tools.exec_command({cmd:"pwd && rg --files -g \'*.py\'",max_output_tokens:4000}));text(await tools.exec_command({cmd:"git status --short && git log -8 --oneline",max_output_tokens:3000}));\n'),
        exec('text(await tools.exec_command({cmd:"cat docs/a.md\\ncat docs/b.md","max_output_tokens":12500}));\n'),
        exec('text(await tools.exec_command({cmd:"apply_patch <<\'PATCH\'\\n*** Begin Patch\\n*** Update File: src/cart.py\\n@@\\n-a\\n+b\\n*** Add File: src/totals.py\\n+x\\n*** End Patch\\nPATCH"}));\n'),
        exec('text(await tools.web__run({open:[{ref_id:"https://example.com/docs"}],response_length:"long"}));\n'),
    ]);
    assert.deepEqual(got.entries.map((entry) => [entry.kind, entry.text]), [
        ['shell', "pwd && rg --files -g '*.py'"], ['shell', 'git status --short && git log -8 --oneline'],
        ['read', 'cat docs/a.md cat docs/b.md'],
        ['edit', 'src/cart.py'], ['edit', 'src/totals.py'],
        ['web', 'https://example.com/docs'],
    ]);
    assert.ok(got.entries.every((entry) => !entry.text.includes('tools.exec_command') && entry.at === at('2026-09-21T04:32:19.079Z')));
    assert.deepEqual(touchedFiles(got.entries), ['src/cart.py', 'src/totals.py'], 'Codex edits reach the hints');
    assert.deepEqual(execCalls('text(await tools.something_else({}));'), [{ kind: 'other', text: 'exec' }]);
});

const message = (text: string): string => JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } });

test('codex: the shell-command and plugin pseudo-prompts are noise', () => {
    const got = extractCodex([message('<user_shell_command>\n<command>ls</command></user_shell_command>'), message('<recommended_plugins>x</recommended_plugins>'), message('please fix the build')]);
    assert.deepEqual(got.entries.map((entry) => entry.text), ['please fix the build']);
});

test('opencode: parts carry their time, tools their kind, and the compaction answer is a note, not a turn', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'recap-context-'));
    try {
        const fixture = opencodeFixture(dir);
        fixture.add({ id: 'm1', session: 'ses_new', role: 'user', updated: 100, data: { time: { created: 1_790_000_000_000 } }, parts: [{ type: 'text', text: 'rename the table', time: { start: 1_790_000_001_000 } }] });
        fixture.add({ id: 'm2', session: 'ses_new', role: 'assistant', updated: 110, data: { time: { created: 1_790_000_005_000 } }, parts: [
            { type: 'tool', tool: 'edit', state: { input: { filePath: 'db/schema.sql' } } },
            { type: 'tool', tool: 'bash', state: { input: { command: 'make migrate', description: 'Apply it' } } },
            { type: 'tool', tool: 'read', state: { input: { filePath: 'db/a.sql' } } },
            { type: 'text', text: 'Renamed.' },
        ] });
        fixture.add({ id: 'm3', session: 'ses_new', role: 'assistant', updated: 120, data: { 'summary': true, mode: 'compaction', time: { created: 1_790_000_009_000 } }, parts: [{ type: 'text', text: '## Goal\nRename the table.' }] });
        fixture.close();
        const reader = new OpencodeTranscripts(fixture.db);
        const located = await reader.locate(laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'opencode', cwd: '/repo' }));
        assert.equal(located.kind, 'located');
        const chunk = await reader.read((located as { source: string }).source, UNREAD, 1 << 20);
        assert.equal(chunk.kind, 'chunk');
        const got = chunk;
        assert.deepEqual(got.entries.map((entry) => [entry.role, entry.kind, entry.text, entry.at]), [
            ['user', undefined, 'rename the table', 1_790_000_001_000], ['tool', 'edit', 'db/schema.sql', 1_790_000_005_000],
            ['tool', 'shell', '', 1_790_000_005_000], ['tool', 'read', 'db/a.sql', 1_790_000_005_000], ['agent', undefined, 'Renamed.', 1_790_000_005_000],
        ]);
        assert.deepEqual(got.notes, [{ kind: 'compaction', at: 1_790_000_009_000, text: '## Goal\nRename the table.' }]);
    } finally {
        rmSync(dir, { recursive: true });
    }
});
