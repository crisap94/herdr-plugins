import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ClaudeTranscripts } from '#src/adapters/claude-transcripts.ts';
import { CodexTranscripts } from '#src/adapters/codex-transcripts.ts';
import { OpencodeTranscripts, opencodeDatabase } from '#src/adapters/opencode-transcripts.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { UNREAD } from '#src/ports/transcripts.ts';
import type { Chunk, ChunkResult, Located } from '#src/ports/transcripts.ts';

const scratch = (): string => mkdtempSync(join(tmpdir(), 'recap-readers-'));
const laneIn = (agent: string, extra: { session?: string; cwd?: string } = {}): Lane =>
    laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent, ...extra });

function chunkOf(result: ChunkResult): Chunk {
    assert.equal(result.kind, 'chunk', JSON.stringify(result));
    return result;
}

function sourceOf(located: Located): string {
    assert.equal(located.kind, 'located', JSON.stringify(located));
    return (located as { source: string }).source;
}

const userRow = (text: string): string => `${JSON.stringify({ type: 'user', message: { content: text } })}\n`;

test('a JSONL reader owns its position: bytes after the last complete line; nothing new is not growth; an append reads only the new lines', async () => {
    const dir = scratch();
    try {
        mkdirSync(join(dir, 'proj'));
        writeFileSync(join(dir, 'proj', 's1.jsonl'), `${userRow('first')}${userRow('second')}{"type":"user","message":{"content":"half a li`);
        const reader = new ClaudeTranscripts(dir);
        const source = sourceOf(await reader.locate(laneIn('claude', { session: 's1' })));
        const first = chunkOf(await reader.read(source, UNREAD, 1 << 20));
        assert.deepEqual(first.entries.map((entry) => entry.text), ['first', 'second']);
        assert.equal(first.grew, true);
        assert.equal(first.position.tail, null);
        assert.equal(first.position.cursor, Buffer.byteLength(`${userRow('first')}${userRow('second')}`), 'the half line is not consumed');
        const quiet = chunkOf(await reader.read(source, first.position, 1 << 20));
        assert.deepEqual([quiet.entries.length, quiet.position.cursor], [0, first.position.cursor]);
        appendFileSync(join(dir, 'proj', 's1.jsonl'), `-f of a line"}}\n${userRow('third')}`);
        const next = chunkOf(await reader.read(source, first.position, 1 << 20));
        assert.equal(next.grew, true);
        assert.deepEqual(next.entries.map((entry) => entry.text), ['half a li-f of a line', 'third']);
    } finally {
        rmSync(dir, { recursive: true });
    }
});

test('the budget is the reader\'s: a long file is read from its end, never from its start (claude and codex alike)', async () => {
    const dir = scratch();
    try {
        mkdirSync(join(dir, 'proj'));
        const rows = Array.from({ length: 200 }, (_, at) => userRow(`turn ${at} ${'x'.repeat(40)}`)).join('');
        writeFileSync(join(dir, 'proj', 's1.jsonl'), rows);
        const claude = new ClaudeTranscripts(dir);
        const got = chunkOf(await claude.read(sourceOf(await claude.locate(laneIn('claude', { session: 's1' }))), UNREAD, 2000));
        assert.ok(got.entries.length > 0 && got.entries.length < 200);
        assert.ok(got.entries.some((entry) => entry.text.startsWith('turn 199 ')), 'the newest turn is read');
        assert.ok(!got.entries.some((entry) => entry.text.startsWith('turn 0 ')));
        const day = new Date();
        const sessions = join(dir, 'codex', String(day.getFullYear()), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0'));
        mkdirSync(sessions, { recursive: true });
        const rollout = [{ type: 'session_meta', payload: { cwd: '/repo' } }, ...Array.from({ length: 100 }, (_, at) => ({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ text: `ask ${at} ${'y'.repeat(40)}` }] } }))];
        writeFileSync(join(sessions, 'rollout-a.jsonl'), rollout.map((row) => `${JSON.stringify(row)}\n`).join(''));
        const codex = new CodexTranscripts(join(dir, 'codex'));
        const seen = chunkOf(await codex.read(sourceOf(await codex.locate(laneIn('codex', { cwd: '/repo' }))), UNREAD, 1500));
        assert.ok(seen.entries.at(-1)?.text.startsWith('ask 99 '));
        assert.ok(seen.entries.length < 100);
    } finally {
        rmSync(dir, { recursive: true });
    }
});

interface Fixture { readonly db: string; add(message: { id: string; session: string; role: string; updated: number; parts: readonly object[] }): void; close(): void }

/** A WAL database like opencode's. Tests create their own fixtures, so they may open one writable. */
function opencodeFixture(dir: string): Fixture {
    const db = join(dir, 'opencode.db');
    const writer = new DatabaseSync(db);
    writer.exec('PRAGMA journal_mode = WAL');
    writer.exec('CREATE TABLE session (id text PRIMARY KEY, directory text NOT NULL, parent_id text, title text NOT NULL, time_updated integer NOT NULL, time_archived integer)');
    writer.exec('CREATE TABLE message (id text PRIMARY KEY, session_id text NOT NULL, time_created integer NOT NULL, time_updated integer NOT NULL, data text NOT NULL)');
    writer.exec('CREATE TABLE part (id text PRIMARY KEY, message_id text NOT NULL, session_id text NOT NULL, time_created integer NOT NULL, time_updated integer NOT NULL, data text NOT NULL)');
    const session = writer.prepare('INSERT INTO session VALUES (?, ?, ?, ?, ?, ?)');
    session.run('ses_new', '/repo', null, 'Fix the build', 50, null);
    session.run('ses_old', '/repo', null, 'Old', 10, null);
    session.run('ses_child', '/repo', 'ses_new', 'Subagent', 99, null);
    session.run('ses_gone', '/repo', null, 'Archived', 98, 1);
    session.run('ses_other', '/elsewhere', null, 'Other', 97, null);
    let parts = 0;
    return {
        db,
        add: ({ id, session: sessionId, role, updated, parts: list }): void => {
            writer.prepare('INSERT INTO message VALUES (?, ?, ?, ?, ?)').run(id, sessionId, updated, updated, JSON.stringify({ role }));
            for (const part of list) {
                parts += 1;
                writer.prepare('INSERT INTO part VALUES (?, ?, ?, ?, ?, ?)').run(`prt_${parts}`, id, sessionId, updated, updated, JSON.stringify(part));
            }
        },
        close: (): void => { writer.close(); },
    };
}

test('opencode: the newest top-level, unarchived session of the lane\'s cwd; the cursor is the newest time_updated; a WAL database with no -shm is readable', async () => {
    const dir = scratch();
    try {
        const fixture = opencodeFixture(dir);
        fixture.add({ id: 'm1', session: 'ses_new', role: 'user', updated: 100, parts: [{ type: 'text', text: 'why does the build fail?' }] });
        fixture.add({ id: 'm2', session: 'ses_new', role: 'assistant', updated: 120, parts: [
            { type: 'step-start' }, { type: 'reasoning', text: 'hidden thoughts' },
            { type: 'tool', tool: 'bash', state: { status: 'completed', input: { command: 'npm test' }, output: 'huge output' } },
            { type: 'text', text: 'A type error in the parser.' }, { type: 'text', text: 'injected', synthetic: true },
        ] });
        fixture.close();
        for (const leftover of ['opencode.db-shm', 'opencode.db-wal']) {
            rmSync(join(dir, leftover), { force: true });
        }
        const reader = new OpencodeTranscripts(fixture.db);
        const source = sourceOf(await reader.locate(laneIn('opencode', { cwd: '/repo' })));
        assert.equal(source, `${fixture.db}#ses_new`);
        const first = chunkOf(await reader.read(source, UNREAD, 1 << 20));
        assert.deepEqual(first.entries, [
            { role: 'user', text: 'why does the build fail?' }, { role: 'tool', text: 'bash: npm test' }, { role: 'agent', text: 'A type error in the parser.' },
        ]);
        assert.deepEqual([first.position, first.grew, first.title, first.lastPrompt], [{ cursor: 120, tail: null }, true, 'Fix the build', 'why does the build fail?']);
        const quiet = chunkOf(await reader.read(source, first.position, 1 << 20));
        assert.deepEqual([quiet.entries.length, quiet.grew, quiet.position.cursor], [0, false, 120]);
        assert.equal((await reader.locate(laneIn('opencode', { cwd: '/nowhere' }))).kind, 'unknown');
        assert.equal((await reader.locate(laneIn('opencode'))).kind, 'unknown', 'a lane with no cwd cannot be placed');
    } finally {
        rmSync(dir, { recursive: true });
    }
});

test('opencode: a message written after the cursor is the only thing read next; a missing database is an Unknown, not a crash', async () => {
    const dir = scratch();
    try {
        const fixture = opencodeFixture(dir);
        fixture.add({ id: 'm1', session: 'ses_new', role: 'user', updated: 100, parts: [{ type: 'text', text: 'one' }] });
        const reader = new OpencodeTranscripts(fixture.db);
        const source = sourceOf(await reader.locate(laneIn('opencode', { cwd: '/repo' })));
        const first = chunkOf(await reader.read(source, UNREAD, 1 << 20));
        fixture.add({ id: 'm2', session: 'ses_new', role: 'user', updated: 130, parts: [{ type: 'text', text: 'two' }] });
        const next = chunkOf(await reader.read(source, first.position, 1 << 20));
        assert.deepEqual(next.entries, [{ role: 'user', text: 'two' }]);
        assert.equal(next.position.cursor, 130);
        fixture.close();
        const missing = new OpencodeTranscripts(join(dir, 'nope.db'));
        assert.equal((await missing.locate(laneIn('opencode', { cwd: '/repo' }))).kind, 'unknown');
        assert.equal((await missing.read(`${join(dir, 'nope.db')}#x`, UNREAD, 100)).kind, 'unknown');
    } finally {
        rmSync(dir, { recursive: true });
    }
});

test('opencode: the reader cannot write — the handle is read-only', () => {
    const dir = scratch();
    try {
        const fixture = opencodeFixture(dir);
        fixture.close();
        const probe = [
            "import { DatabaseSync } from 'node:sqlite';",
            `const db = new DatabaseSync(${JSON.stringify(fixture.db)}, { readOnly: true });`,
            "try { db.exec(\"INSERT INTO session VALUES ('x', '/', NULL, 't', 1, NULL)\"); console.log('wrote'); } catch (error) { console.log('refused'); }",
        ].join('\n');
        assert.equal(execFileSync(process.execPath, ['--input-type=module', '-e', probe], { encoding: 'utf8' }).trim(), 'refused');
    } finally {
        rmSync(dir, { recursive: true });
    }
});

test('node:sqlite prints nothing on stderr when run the way the plugin launches node (plain, no flag)', () => {
    const dir = scratch();
    try {
        const fixture = opencodeFixture(dir);
        fixture.add({ id: 'm1', session: 'ses_new', role: 'user', updated: 100, parts: [{ type: 'text', text: 'one' }] });
        fixture.close();
        const adapter = new URL('../src/adapters/opencode-transcripts.ts', import.meta.url).href;
        const script = `import { OpencodeTranscripts } from ${JSON.stringify(adapter)};\nconst r = new OpencodeTranscripts(${JSON.stringify(fixture.db)});\nconst l = await r.locate({ cwd: '/repo', pane: 'p' });\nconsole.log(l.kind);`;
        const ran = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
        assert.equal(ran.stdout.trim(), 'located');
        assert.equal(ran.stderr, '', 'no ExperimentalWarning (nor anything else) on stderr');
    } finally {
        rmSync(dir, { recursive: true });
    }
});

test('opencodeDatabase honours XDG_DATA_HOME', () => {
    assert.equal(opencodeDatabase({ XDG_DATA_HOME: '/data' }), '/data/opencode/opencode.db');
    assert.match(opencodeDatabase({}), /\.local\/share\/opencode\/opencode\.db$/);
});

const assistantRow = (text: string): string => `${JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } })}\n`;

test('latestPrompt (claude): only the newest user prompt, from the tail of the file — and it moves no position', async () => {
    const dir = scratch();
    try {
        mkdirSync(join(dir, 'proj'));
        const filler = assistantRow('x'.repeat(300)).repeat(200);
        writeFileSync(join(dir, 'proj', 's1.jsonl'), `${userRow('very old prompt')}${filler}${userRow('first of the turn')}${assistantRow('ok')}${userRow('the newest prompt')}${assistantRow('on it')}`);
        const reader = new ClaudeTranscripts(dir);
        const source = sourceOf(await reader.locate(laneIn('claude', { session: 's1' })));
        assert.deepEqual(await reader.latestPrompt(source, 4000), { kind: 'prompt', text: 'the newest prompt' });
        assert.deepEqual(await reader.latestPrompt(source, 100), { kind: 'prompt', text: null }, 'nothing within the budget: none, not the old one');
        const chunk = chunkOf(await reader.read(source, UNREAD, 1 << 20));
        assert.equal(chunk.entries.filter((entry) => entry.role === 'user').length, 3, 'the recap read still sees everything from its own cursor');
        assert.equal((await reader.latestPrompt('/no/such/file', 100)).kind, 'unknown');
    } finally {
        rmSync(dir, { recursive: true });
    }
});

const message = (role: string, text: string): string => `${JSON.stringify({ type: 'response_item', payload: { type: 'message', role, content: [{ type: 'input_text', text }] } })}\n`;

test('latestPrompt (codex): the newest user message of the rollout tail, not the injected context', async () => {
    const dir = scratch();
    try {
        const day = new Date();
        const folder = join(dir, String(day.getFullYear()), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0'));
        mkdirSync(folder, { recursive: true });
        const file = join(folder, 'rollout-1.jsonl');
        writeFileSync(file, `${message('user', 'first question')}${message('assistant', 'answer')}${message('user', '<environment_context>noise</environment_context>')}${message('user', 'second question')}${message('assistant', 'again')}`);
        const reader = new CodexTranscripts(dir);
        assert.deepEqual(await reader.latestPrompt(file, 100_000), { kind: 'prompt', text: 'second question' });
        assert.deepEqual(await reader.latestPrompt(file, 1), { kind: 'prompt', text: null });
    } finally {
        rmSync(dir, { recursive: true });
    }
});

test('latestPrompt (opencode): the newest user message of the session; none for a session with only agent messages', async () => {
    const dir = scratch();
    try {
        const fixture = opencodeFixture(dir);
        fixture.add({ id: 'm1', session: 'ses_new', role: 'user', updated: 100, parts: [{ type: 'text', text: 'first' }] });
        fixture.add({ id: 'm2', session: 'ses_new', role: 'assistant', updated: 110, parts: [{ type: 'text', text: 'reply' }] });
        fixture.add({ id: 'm3', session: 'ses_new', role: 'user', updated: 120, parts: [{ type: 'text', text: 'second' }, { type: 'text', text: 'injected', synthetic: true }] });
        fixture.add({ id: 'm4', session: 'ses_new', role: 'assistant', updated: 130, parts: [{ type: 'tool', tool: 'bash', state: { input: { command: 'ls' } } }] });
        fixture.add({ id: 'm5', session: 'ses_old', role: 'assistant', updated: 20, parts: [{ type: 'text', text: 'only me' }] });
        fixture.close();
        const reader = new OpencodeTranscripts(fixture.db);
        assert.deepEqual(await reader.latestPrompt(`${fixture.db}#ses_new`), { kind: 'prompt', text: 'second' });
        assert.deepEqual(await reader.latestPrompt(`${fixture.db}#ses_old`), { kind: 'prompt', text: null });
        assert.equal((await new OpencodeTranscripts(join(dir, 'missing.db')).latestPrompt('x#y')).kind, 'unknown');
    } finally {
        rmSync(dir, { recursive: true });
    }
});
