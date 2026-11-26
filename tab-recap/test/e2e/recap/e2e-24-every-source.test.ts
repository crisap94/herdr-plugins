import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { adapterEnv } from '@stateforge-labs/harness-adapters';
import { opencodeDatabasePath } from '@stateforge-labs/harness-adapters/opencode/store';
import { textOf, unknown } from '@stateforge-labs/session-ledger';
import { causeOf } from '#test/fakes/cause.ts';
import type { Recap, RecapRequest } from '@stateforge-labs/session-ledger';
import { ClaudeTranscripts } from '#src/adapters/transcripts/claude/transcripts.ts';
import { CodexTranscripts } from '#src/adapters/transcripts/codex/transcripts.ts';
import { OpencodeTranscripts } from '#src/adapters/transcripts/opencode/transcripts.ts';
import { daemonTranscriptRegistry, modalTranscriptRegistry, replayTranscriptRegistry } from '#src/adapters/transcripts/registry.ts';
import { fsPathOf } from '#test/fakes/transcript-lines.ts';
import { storeRead } from '#test/db/support.ts';
import type { ScreenOutcome, ScreenReader } from '#src/ports/screens.ts';
import { agentKind } from '#test/support/ids.ts';
import { countOf } from '@stateforge-labs/session-ledger';
import { opencodeFixture, recordedLines, type AddMessage, registryOf, sourceWorld, type SourceWorld, underScratchHome } from '../support/source-world.ts';

const codexUser = (text: string): string => `${JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } })}\n`;

const sha = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

const recapOf = (world: SourceWorld): Recap | null => storeRead(world.store.records.readRecap(world.scope));

const entriesOf = (request: RecapRequest | undefined, at = 0): readonly { readonly role: string; readonly text: string; readonly kind?: string; readonly what?: string; readonly at?: number }[] => request?.input.transcripts[at]?.entries ?? [];

const toolsOf = (request: RecapRequest | undefined, at = 0): readonly (readonly [string | undefined, string])[] =>
    entriesOf(request, at).filter((entry) => entry.role === 'tool').map((entry) => [entry.kind, entry.what ?? entry.text] as const);

const CLAUDE_TOOLS = [
    ['shell', 'call Bash'], ['shell', 'call bash'], ['read', '/repo/Read.ts'], ['read', '/repo/Grep.ts'], ['read', '/repo/Glob.ts'], ['read', '/repo/LS.ts'],
    ['edit', '/repo/Edit.ts'], ['edit', '/repo/Write.ts'], ['edit', '/repo/MultiEdit.ts'], ['edit', '/repo/NotebookEdit.ts'],
    ['web', 'https://example.test/WebFetch'], ['web', 'search WebSearch'], ['agent', 'call Agent'], ['agent', 'call Task'], ['other', 'read: call read'], ['read', 'List files'],
] as const;

const OPENCODE_TOOLS = ['bash', 'read', 'grep', 'glob', 'list', 'edit', 'write', 'patch', 'apply_patch', 'webfetch', 'websearch', 'codesearch', 'subagent', 'task', 'Read'] as const;

const OPENCODE_KINDS = [
    ['shell', 'call bash'], ['read', '/repo/read.ts'], ['read', '/repo/grep.ts'], ['read', '/repo/glob.ts'], ['read', '/repo/list.ts'],
    ['edit', '/repo/edit.ts'], ['edit', '/repo/write.ts'], ['edit', '/repo/patch.ts'], ['edit', '/repo/apply_patch.ts'],
    ['web', 'https://example.test/webfetch'], ['web', 'https://example.test/websearch'], ['web', 'https://example.test/codesearch'],
    ['agent', 'call subagent'], ['agent', 'call task'], ['other', 'Read: call Read'],
] as const;

interface Followed {
    readonly world: SourceWorld;
    readonly file: string;
    readonly refresh: () => Promise<void>;
}

function claudeWorld(): Followed {
    const world = sourceWorld();
    const file = world.claudeFile('s1', 'claude-session.jsonl');
    const engine = world.engineOver(registryOf([new ClaudeTranscripts(fsPathOf(join(world.dir, 'claude')))]));
    return { world, file, refresh: () => engine.refresh(world.scope, [world.seat('claude', { session: 's1' })]) };
}

function codexWorld(): Followed {
    const world = sourceWorld();
    const file = world.codexFile('codex-session.jsonl');
    const engine = world.engineOver(registryOf([new CodexTranscripts(fsPathOf(join(world.dir, 'codex')))]));
    return { world, file, refresh: () => engine.refresh(world.scope, [world.seat('codex', { cwd: '/repo' })]) };
}

interface OpencodeFollowed {
    readonly world: SourceWorld;
    readonly db: string;
    readonly add: (row: AddMessage) => void;
    readonly close: () => void;
    readonly refresh: () => Promise<void>;
}

function opencodeWorld(): OpencodeFollowed {
    const world = sourceWorld();
    const fixture = opencodeFixture(world.dir);
    fixture.add({ id: 'm1', session: 'ses_new', role: 'user', updated: 100, parts: [{ type: 'text', text: textOf('why does the build fail?') }] });
    fixture.add({
        id: 'm2', session: 'ses_new', role: 'assistant', updated: 120, parts: [
            { type: 'step-start' }, { type: 'reasoning', text: 'hidden thoughts' },
            ...OPENCODE_TOOLS.map((tool) => ({ type: 'tool', tool, state: { status: 'completed', input: { command: 'npm test', filePath: `/repo/${tool}.ts`, pattern: tool, url: `https://example.test/${tool}`, query: `q ${tool}`, description: `call ${tool}` }, output: 'huge output' } })),
            { type: 'text', text: 'A type error in the parser.' }, { type: 'text', text: 'injected', synthetic: true },
        ],
    });
    const engine = world.engineOver(registryOf([new OpencodeTranscripts(fsPathOf(fixture.db))]));
    return { world, db: fixture.db, add: (row) => { fixture.add(row); }, close: () => { fixture.close(); }, refresh: () => engine.refresh(world.scope, [world.seat('opencode', { cwd: '/repo' })]) };
}

test('claude: the transcript is found by its session and read once; the prompt, the reply and the tool calls reach the writer with their time', async () => {
    const { world, refresh } = claudeWorld();
    try {
        await refresh();
        assert.equal(world.requests.length, 1);
        const entries = entriesOf(world.requests[0]);
        assert.deepEqual(entries.slice(0, 2).map((entry) => [entry.role, entry.text, entry.at]), [['user', 'why does the build fail?', Date.parse('2026-10-08T10:00:01.000Z')], ['agent', 'A type error in the parser.', Date.parse('2026-10-08T10:00:04.000Z')]]);
        assert.equal(entries.length, 2 + CLAUDE_TOOLS.length);
    } finally {
        world.dispose();
    }
});

test('claude: thinking, meta rows, slash-command rows and tool results never reach the writer', async () => {
    const { world, refresh } = claudeWorld();
    try {
        await refresh();
        const texts = entriesOf(world.requests[0]).map((entry) => entry.text).join('\n');
        for (const hidden of ['hidden thoughts', 'meta noise', '/clear', 'huge tool output']) {
            assert.ok(!texts.includes(hidden), hidden);
        }
    } finally {
        world.dispose();
    }
});

test('claude: the title, the away summary and the last prompt are kept with the lane', async () => {
    const { world, refresh } = claudeWorld();
    try {
        await refresh();
        const lane = recapOf(world)?.sessions[0];
        assert.deepEqual([lane?.title, lane?.lastPrompt, lane?.harnessRecap], ['Fix the parser', 'why does the build fail?', 'Fixing the parser type error.']);
    } finally {
        world.dispose();
    }
});

test('claude: each recorded tool name gets its call kind, and a foreign name is other', async () => {
    const { world, refresh } = claudeWorld();
    try {
        await refresh();
        assert.deepEqual(toolsOf(world.requests[0]), CLAUDE_TOOLS);
    } finally {
        world.dispose();
    }
});

test('claude: read again with nothing new, the cursor stays and the writer is not asked', async () => {
    const { world, file, refresh } = claudeWorld();
    try {
        await refresh();
        const first = recapOf(world)?.sessions[0]?.cursor;
        assert.equal(first, statSync(file).size);
        await refresh();
        assert.equal(world.requests.length, 1);
        assert.equal(recapOf(world)?.sessions[0]?.cursor, first);
    } finally {
        world.dispose();
    }
});

test('claude: an append is the only thing read next, and a half line waits until it is whole', async () => {
    const { world, file, refresh } = claudeWorld();
    try {
        await refresh();
        const whole = statSync(file).size;
        appendFileSync(file, '{"type":"user","message":{"content":"half a li');
        await refresh();
        assert.equal(world.requests.length, 1, 'a half line alone is not growth');
        assert.equal(recapOf(world)?.sessions[0]?.cursor, whole, 'the half line is not consumed');
        appendFileSync(file, '-f of a line"}}\n');
        appendFileSync(file, `${recordedLines('claude-more.jsonl').join('\n')}\n`);
        await refresh();
        assert.deepEqual(entriesOf(world.requests[1]).map((entry) => entry.text), ['half a li-f of a line', 'and the lexer?', 'The lexer is fine.']);
        assert.equal(recapOf(world)?.sessions[0]?.cursor, statSync(file).size);
    } finally {
        world.dispose();
    }
});

test('claude: reading never changes the transcript', async () => {
    const { world, file, refresh } = claudeWorld();
    try {
        const before = sha(file);
        await refresh();
        await refresh();
        assert.equal(sha(file), before);
    } finally {
        world.dispose();
    }
});

test('claude: a long file is read from its end, never from its start', async () => {
    const world = sourceWorld();
    try {
        const file = world.claudeFile('s1', 'claude-more.jsonl');
        const rows = Array.from({ length: 60_000 }, (_, at) => `${JSON.stringify({ type: 'user', message: { content: `turn ${at} ${'x'.repeat(80)}` } })}\n`).join('');
        writeFileSync(file, rows);
        const engine = world.engineOver(registryOf([new ClaudeTranscripts(fsPathOf(join(world.dir, 'claude')))]));
        await engine.refresh(world.scope, [world.seat('claude', { session: 's1' })]);
        const texts = entriesOf(world.requests[0]).map((entry) => entry.text);
        assert.ok(texts.length > 0 && texts.length < 60_000);
        assert.ok(texts.some((text) => text.startsWith('turn 59999 ')), 'the newest turn is read');
        assert.ok(!texts.some((text) => text.startsWith('turn 0 ')), 'the oldest turn is not');
    } finally {
        world.dispose();
    }
});

test('codex: the rollout is found by the lane\'s folder and read once; injected context, developer rows and reasoning never reach the writer', async () => {
    const { world, refresh } = codexWorld();
    try {
        await refresh();
        assert.deepEqual(entriesOf(world.requests[0]).map((entry) => [entry.role, entry.text]), [['user', 'fix the test'], ['tool', 'shell: npm test'], ['tool', 'a.ts'], ['tool', 'cat a.ts'], ['tool', 'Read'], ['agent', 'Fixed.']]);
        assert.equal(entriesOf(world.requests[0])[0]?.at, Date.parse('2026-09-21T04:32:19.079Z'));
        assert.equal(recapOf(world)?.sessions[0]?.lastPrompt, 'fix the test');
    } finally {
        world.dispose();
    }
});

test('codex: each recorded tool name gets its call kind, and a foreign name is other', async () => {
    const { world, refresh } = codexWorld();
    try {
        await refresh();
        assert.deepEqual(entriesOf(world.requests[0]).filter((entry) => entry.role === 'tool').map((entry) => entry.kind), ['other', 'edit', 'read', 'other']);
    } finally {
        world.dispose();
    }
});

test('codex: read again with nothing new the writer is not asked, and the rollout is never changed', async () => {
    const { world, file, refresh } = codexWorld();
    try {
        const before = sha(file);
        await refresh();
        await refresh();
        assert.equal(world.requests.length, 1);
        assert.equal(recapOf(world)?.sessions[0]?.cursor, statSync(file).size);
        assert.equal(sha(file), before);
    } finally {
        world.dispose();
    }
});

test('codex: a long rollout is read from its end, never from its start', async () => {
    const world = sourceWorld();
    try {
        const file = world.codexFile('codex-session.jsonl');
        writeFileSync(file, `${JSON.stringify({ type: 'session_meta', payload: { cwd: '/repo' } })}\n${Array.from({ length: 60_000 }, (_, at) => codexUser(`ask ${at} ${'y'.repeat(80)}`)).join('')}`);
        const engine = world.engineOver(registryOf([new CodexTranscripts(fsPathOf(join(world.dir, 'codex')))]));
        await engine.refresh(world.scope, [world.seat('codex', { cwd: '/repo' })]);
        const texts = entriesOf(world.requests[0]).map((entry) => entry.text);
        assert.ok(texts.length > 0 && texts.length < 60_000);
        assert.ok(texts.at(-1)?.startsWith('ask 59999 '));
        assert.ok(!texts.some((text) => text.startsWith('ask 0 ')));
    } finally {
        world.dispose();
    }
});

test('opencode: the newest top-level, unarchived session of the lane\'s folder is read once; reasoning, step markers and injected text never reach the writer', async () => {
    const { world, refresh } = opencodeWorld();
    try {
        await refresh();
        const entries = entriesOf(world.requests[0]);
        assert.deepEqual([entries[0]?.role, entries[0]?.text, entries.at(-1)?.role, entries.at(-1)?.text], ['user', 'why does the build fail?', 'agent', 'A type error in the parser.']);
        const texts = entries.map((entry) => entry.text).join('\n');
        for (const hidden of ['hidden thoughts', 'injected', 'huge output']) {
            assert.ok(!texts.includes(hidden), hidden);
        }
        assert.deepEqual([recapOf(world)?.sessions[0]?.transcript.endsWith('#ses_new'), recapOf(world)?.sessions[0]?.title], [true, 'Fix the build']);
    } finally {
        world.dispose();
    }
});

test('opencode: each recorded tool name gets its call kind, and a foreign name is other', async () => {
    const { world, refresh } = opencodeWorld();
    try {
        await refresh();
        assert.deepEqual(toolsOf(world.requests[0]), OPENCODE_KINDS);
    } finally {
        world.dispose();
    }
});

test('opencode: the cursor is the newest time_updated; read again with nothing new, the writer is not asked', async () => {
    const { world, refresh } = opencodeWorld();
    try {
        await refresh();
        assert.equal(recapOf(world)?.sessions[0]?.cursor, 120);
        await refresh();
        assert.equal(world.requests.length, 1);
        assert.equal(recapOf(world)?.sessions[0]?.cursor, 120);
    } finally {
        world.dispose();
    }
});

test('opencode: a message written after the cursor is the only thing read next', async () => {
    const { world, add, refresh } = opencodeWorld();
    try {
        await refresh();
        add({ id: 'm3', session: 'ses_new', role: 'user', updated: 130, parts: [{ type: 'text', text: textOf('and the lexer?') }] });
        await refresh();
        assert.deepEqual(entriesOf(world.requests[1]).map((entry) => entry.text), ['and the lexer?']);
        assert.equal(recapOf(world)?.sessions[0]?.cursor, 130);
    } finally {
        world.dispose();
    }
});

test('opencode: a WAL database whose -shm and -wal files are gone is still readable, and reading never changes it', async () => {
    const { world, db, close, refresh } = opencodeWorld();
    try {
        close();
        for (const leftover of ['opencode.db-shm', 'opencode.db-wal']) {
            rmSync(join(world.dir, leftover), { force: true });
        }
        const before = sha(db);
        await refresh();
        await refresh();
        assert.equal(world.requests.length, 1);
        assert.equal(sha(db), before);
    } finally {
        world.dispose();
    }
});

test('opencode: a missing database, or a lane with no folder, is reported by name and the others go on', async () => {
    const world = sourceWorld();
    try {
        const engine = world.engineOver(registryOf([new OpencodeTranscripts(fsPathOf(join(world.dir, 'nope.db'))), new ClaudeTranscripts(fsPathOf(join(world.dir, 'claude')))]));
        world.claudeFile('s1', 'claude-session.jsonl');
        await engine.refresh(world.scope, [world.seat('opencode', { cwd: '/repo' }), world.seat('claude', { session: 's1', pane: 'src:p2' })]);
        assert.match(recapOf(world)?.error ?? '', /src:p1/u);
        assert.equal(world.requests.length, 1);
        assert.equal(world.requests[0]?.input.transcripts.length, 1);
    } finally {
        world.dispose();
    }
});

test('opencode: a lane whose folder has no session, or no folder at all, cannot be placed', async () => {
    const { world } = opencodeWorld();
    try {
        const engine = world.engineOver(registryOf([new OpencodeTranscripts(fsPathOf(join(world.dir, 'opencode.db')))]));
        await engine.refresh(world.scope, [world.seat('opencode', { cwd: '/nowhere' })]);
        assert.match(recapOf(world)?.error ?? '', /src:p1/u);
        await engine.refresh(world.scope, [world.seat('opencode')]);
        assert.match(recapOf(world)?.error ?? '', /src:p1/u);
        assert.equal(world.requests.length, 0);
    } finally {
        world.dispose();
    }
});

test('opencode: the database lives under XDG_DATA_HOME when it is set', () => {
    assert.equal(opencodeDatabasePath(adapterEnv({ XDG_DATA_HOME: '/data' })), '/data/opencode/opencode.db');
    assert.match(underScratchHome(() => opencodeDatabasePath(adapterEnv({}))), /\.local\/share\/opencode\/opencode\.db$/u);
});

const SCREEN = [
    '● I fixed the parser and the tests pass now.',
    '',
    '  Ran 2 shell commands',
    '',
    '────────────────────────────────────────',
    '❯ ',
    '────────────────────────────────────────',
    '  ⏵⏵ auto mode on (shift+tab to cycle) · esc to interrupt',
    '✻ Brewing… (12s · ↓ 1.2k tokens)',
].join('\n');

function screens(text: string = SCREEN): ScreenReader {
    return { readScreen: (): Promise<ScreenOutcome> => Promise.resolve({ kind: 'screen', text: textOf(text), revision: countOf(7), truncated: 'absent' }) };
}

test('a screen-only agent is read from its screen; the border, the empty prompt, the key hint and the spinner never reach the writer', async () => {
    const world = sourceWorld();
    try {
        const engine = world.engineOver(underScratchHome(() => daemonTranscriptRegistry(screens(), () => 'present')));
        await engine.refresh(world.scope, [world.seat('gemini')]);
        assert.deepEqual(entriesOf(world.requests[0]).map((entry) => entry.text), ['● I fixed the parser and the tests pass now.', '  Ran 2 shell commands']);
        assert.deepEqual(world.requests[0]?.input.agents.map((agent) => [agent.kind, agent.source]), [['gemini', 'screen']]);
        const seen = entriesOf(world.requests[0]).map((entry) => entry.text).join('\n');
        for (const chrome of ['esc to interrupt', 'shift+tab to cycle', 'Brewing', '────']) {
            assert.ok(!seen.includes(chrome), chrome);
        }
    } finally {
        world.dispose();
    }
});

test('a screen read again with nothing new is not growth', async () => {
    const world = sourceWorld();
    try {
        const engine = world.engineOver(underScratchHome(() => daemonTranscriptRegistry(screens(), () => 'present')));
        await engine.refresh(world.scope, [world.seat('gemini')]);
        await engine.refresh(world.scope, [world.seat('gemini')]);
        assert.equal(world.requests.length, 1);
    } finally {
        world.dispose();
    }
});

test('a screen drops every line of chrome, the leading indent and a line repeated right after itself, and no paragraph outgrows the excerpt clip', async () => {
    const corpus = ['  Kept line', 'esc to interrupt', 'shift+tab to cycle', '? for shortcuts', '⏵⏵ prompt', 'bypass permissions on', '(ctrl+c to cancel)', '✻ Thinking… (12s · ↓ 1.2k tokens)', '❯ ', '────', '', 'same', 'same', 'other', 'same'].join('\n');
    const world = sourceWorld();
    try {
        const engine = world.engineOver(underScratchHome(() => daemonTranscriptRegistry(screens(corpus), () => 'present')));
        await engine.refresh(world.scope, [world.seat('gemini')]);
        assert.deepEqual(entriesOf(world.requests[0]).map((entry) => entry.text), ['Kept line', 'same\nother\nsame']);
    } finally {
        world.dispose();
    }
    const long = sourceWorld();
    try {
        const engine = long.engineOver(underScratchHome(() => daemonTranscriptRegistry(screens('x'.repeat(5000)), () => 'present')));
        await engine.refresh(long.scope, [long.seat('gemini')]);
        const lengths = entriesOf(long.requests[0]).map((entry) => entry.text.length);
        assert.deepEqual(lengths, [2000, 2000, 1000]);
    } finally {
        long.dispose();
    }
});

test('a screen of only chrome is not growth, and a screen that cannot be read is an error in the recap and no model call', async () => {
    const world = sourceWorld();
    try {
        const engine = world.engineOver(underScratchHome(() => daemonTranscriptRegistry(screens('────\n❯ \n'), () => 'present')));
        await engine.refresh(world.scope, [world.seat('gemini')]);
        assert.equal(world.requests.length, 0);
    } finally {
        world.dispose();
    }
    const gone = sourceWorld();
    try {
        const unreadable: ScreenReader = { readScreen: (): Promise<ScreenOutcome> => Promise.resolve(unknown({ why: 'unreachable', detail: causeOf(textOf('gone')) })) };
        const engine = gone.engineOver(underScratchHome(() => daemonTranscriptRegistry(unreadable, () => 'present')));
        await engine.refresh(gone.scope, [gone.seat('gemini')]);
        assert.equal(gone.requests.length, 0);
        assert.match(recapOf(gone)?.error ?? '', /src:p1: unreachable: gone/u);
    } finally {
        gone.dispose();
    }
});

test('a screen is asked for its last 200 lines, its revision is the cursor, and a kind not asked for has no reader', async () => {
    const world = sourceWorld();
    try {
        const asked: { readonly pane: string; readonly lines: number }[] = [];
        const reader: ScreenReader = { readScreen: (pane, lines): Promise<ScreenOutcome> => { asked.push({ pane, lines }); return screens().readScreen(pane, lines); } };
        const engine = world.engineOver(underScratchHome(() => daemonTranscriptRegistry(reader, (agent) => (agent === 'gemini' ? 'present' : 'absent'))));
        await engine.refresh(world.scope, [world.seat('gemini')]);
        assert.deepEqual(asked, [{ pane: 'src:p1', lines: 200 }]);
        const sessions = recapOf(world)?.sessions ?? [];
        assert.deepEqual(sessions.map((session) => [session.transcript, session.cursor]), [['screen:src:p1', 7]]);
        const other = sourceWorld();
        try {
            const second = other.engineOver(underScratchHome(() => daemonTranscriptRegistry(reader, (agent) => (agent === 'gemini' ? 'present' : 'absent'))));
            await second.refresh(other.scope, [other.seat('qwen')]);
            assert.match(recapOf(other)?.error ?? '', /add it to TAB_RECAP_SCREEN_AGENTS to read its screen/u);
            assert.equal(other.requests.length, 0);
        } finally {
            other.dispose();
        }
    } finally {
        world.dispose();
    }
});

test('a custom agent is read from its screen too, and so is a kind named like an object key', async () => {
    const world = sourceWorld();
    try {
        const engine = world.engineOver(underScratchHome(() => daemonTranscriptRegistry(screens(), () => 'present')));
        for (const [at, kind] of ['mycli', '__proto__', 'constructor', 'toString'].entries()) {
            await engine.refresh(world.scope, [world.seat(kind, { pane: `src:p${at + 1}` })]);
        }
        assert.deepEqual(world.requests.map((request) => request.input.agents.map((agent) => [agent.kind, agent.source])), [[['mycli', 'screen']], [['__proto__', 'screen']], [['constructor', 'screen']], [['toString', 'screen']]]);
    } finally {
        world.dispose();
    }
});

test('the modal registry has no screen fallback: an agent without a transcript reader is reported by name', async () => {
    const world = sourceWorld();
    try {
        const engine = world.engineOver(underScratchHome(modalTranscriptRegistry));
        await engine.refresh(world.scope, [world.seat('gemini')]);
        assert.match(recapOf(world)?.error ?? '', /src:p1: no reader for gemini/u);
        assert.equal(world.requests.length, 0);
    } finally {
        world.dispose();
    }
});

test('every registry names its readers: the modal one claude, codex and opencode; replay only claude and codex', () => {
    const modal = underScratchHome(modalTranscriptRegistry);
    assert.deepEqual(['claude', 'codex', 'opencode', 'gemini'].map((kind) => modal.exact(agentKind(kind))?.agent), ['claude', 'codex', 'opencode', undefined]);
    const replay = underScratchHome(replayTranscriptRegistry);
    assert.deepEqual(['claude', 'codex', 'opencode'].map((kind) => replay.exact(agentKind(kind))?.agent), ['claude', 'codex', undefined]);
    const daemon = underScratchHome(() => daemonTranscriptRegistry(screens(), () => 'present'));
    assert.equal(daemon.exact(agentKind('gemini')), undefined);
    assert.equal(daemon.readerFor(agentKind('claude'))?.agent, 'claude');
});
