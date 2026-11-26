import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runningOf, splitReason, parseText, must, countOf, sourcePathOf, textOf, isUnknown, UNREAD } from '@stateforge-labs/session-ledger';
import type { InFlightResult, Located } from '@stateforge-labs/session-ledger';
import { ClaudeTranscripts } from '#src/adapters/transcripts/claude/transcripts.ts';
import { CodexTranscripts } from '#src/adapters/transcripts/codex/transcripts.ts';
import { OpencodeTranscripts } from '#src/adapters/transcripts/opencode/transcripts.ts';
import { LivePrompts } from '#src/recap/application/live-prompts.ts';
import { fsPathOf } from '#test/fakes/transcript-lines.ts';
import { toolPart } from '#test/opencode-fixture.ts';
import { NOW, sections, showRecap, showTab, VERSION } from '../support/view-seeds.ts';
import { withWorld } from '../support/view-world.ts';
import { opencodeFixture, registryOf, sourceWorld, type AddMessage, type SourceWorld, underScratchHome } from '../support/source-world.ts';

const rowOf = (value: object): string => `${JSON.stringify(value)}\n`;
const user = (text: string): string => rowOf({ type: 'user', message: { content: text } });
const reply = (text: string): string => rowOf({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
const BODY = 'Handoff of the parser refactor.\n\nNext steps:\n  - finish the lexer\n  - run the suite';
const BUDGET = countOf(1 << 20);

function scratch<T>(use: (dir: string) => Promise<T>): Promise<T> {
    const dir = mkdtempSync(join(tmpdir(), 'e2e-turn-'));
    return use(dir).finally(() => { rmSync(dir, { recursive: true, force: true }); });
}

function claudeAt(from: string): { readonly reader: ClaudeTranscripts; readonly seat: ReturnType<SourceWorld['seat']>; readonly dispose: () => void } {
    const world = sourceWorld();
    world.claudeFile('s1', from);
    return { reader: new ClaudeTranscripts(fsPathOf(join(world.dir, 'claude'))), seat: world.seat('claude', { session: 's1' }), dispose: () => { world.dispose(); } };
}

async function claudeFlight(from: string): Promise<InFlightResult> {
    const held = claudeAt(from);
    try {
        const located: Located = await held.reader.locate(held.seat);
        assert.equal(located.kind, 'located');
        assert.ok(!isUnknown(located));
        return await held.reader.inFlight.read(located.source, BUDGET);
    } finally {
        held.dispose();
    }
}

const LIVE = [{ tool: 'Bash', label: 'watch the build' }, { tool: 'Bash', label: 'Bash' }, { tool: 'Bash', label: 'Bash' }, { tool: 'Monitor', label: 'tail the log' }, { tool: 'Agent', label: 'review the diff' }];

const labelsOf = (found: InFlightResult): readonly string[] => (found.kind === 'in-flight' ? found.background.map((item) => String(item.label)) : []);

test('claude: a turn with background work lists each launch not yet ended, in launch order, and counts none as foreground', async () => {
    assert.deepEqual(await claudeFlight('claude-turn-in-flight.jsonl'), { kind: 'in-flight', count: runningOf(0), background: LIVE });
});

test('claude: a launch with no description, or a blank one, is labelled by its tool', async () => {
    const found = await claudeFlight('claude-turn-in-flight.jsonl');
    assert.deepEqual(labelsOf(found).slice(1, 3), ['Bash', 'Bash']);
});

test('claude: a transcript that does not parse is unknown, not an empty turn', () => scratch(async (dir) => {
    mkdirSync(join(dir, 'proj'));
    writeFileSync(join(dir, 'proj', 's1.jsonl'), 'not json\n{broken\n');
    const reader = new ClaudeTranscripts(fsPathOf(dir));
    assert.equal((await reader.inFlight.read(sourcePathOf(join(dir, 'proj', 's1.jsonl')), BUDGET)).kind, 'unknown');
}));

test('claude: a launch ended by a delivered notice, or by a queued one, is not listed', async () => {
    const found = await claudeFlight('claude-turn-in-flight.jsonl');
    const labels = labelsOf(found);
    assert.ok(!labels.includes('first shell'));
    assert.ok(!labels.includes('queued end'));
});

test('claude: a Monitor past its own timeout is not listed, a persistent one is', async () => {
    const found = await claudeFlight('claude-turn-in-flight.jsonl');
    const labels = labelsOf(found);
    assert.ok(!labels.includes('old monitor'));
    assert.ok(labels.includes('tail the log'));
});

test('claude: a launch inside a subagent, a quoted notice and a returned foreground subagent change nothing', async () => {
    const found = await claudeFlight('claude-turn-in-flight.jsonl');
    const labels = labelsOf(found);
    assert.ok(!labels.includes('inside a subagent'));
    assert.ok(labels.includes('watch the build'), 'a notice quoted in an assistant row does not end it');
    assert.equal(labels.filter((label) => label === 'Task').length, 0);
});

test('claude: a turn whose background work all ended is not in flight', async () => {
    assert.deepEqual(await claudeFlight('claude-turn-idle.jsonl'), { kind: 'in-flight', count: runningOf(0), background: [] });
});

test('claude: the reader says it separates background work from foreground', () => {
    assert.deepEqual(underScratchHome(() => new ClaudeTranscripts()).inFlight.split, { kind: 'separates' });
});

const codexFlight = async (name: string): Promise<InFlightResult> => {
    const reader = new CodexTranscripts(fsPathOf(tmpdir()));
    return reader.inFlight.read(sourcePathOf(join(import.meta.dirname, '..', '..', 'fixtures', 'codex-inflight', name)), BUDGET);
};

test('codex: all its in-flight work is foreground, and the capability says so by name', () => {
    const { inFlight } = new CodexTranscripts(fsPathOf(tmpdir()));
    if (inFlight.split.kind !== 'foreground-only') {
        throw new Error('codex declares foreground-only');
    }
    assert.equal(inFlight.split.why, 'codex-cells');
    assert.equal(splitReason(inFlight.split.why, must(parseText('codex'))), 'codex cannot tell background work that survives a compaction');
});

test('codex: an exec with no output at the end of the rollout is one in flight, counted not listed', async () => {
    assert.deepEqual(await codexFlight('open-call.jsonl'), { kind: 'in-flight', count: runningOf(1), background: [] });
});

test('codex: a yielded cell stays in flight until a wait on it returns Script completed', async () => {
    assert.deepEqual(await codexFlight('wait-sequence.jsonl'), { kind: 'in-flight', count: runningOf(0), background: [] });
    assert.deepEqual(await codexFlight('yield-no-wait.jsonl'), { kind: 'in-flight', count: runningOf(1), background: [] });
});

test('codex: a yielded cell is still in flight while the wait on it has not returned', () => scratch(async (dir) => {
    const file = join(dir, 'rollout.jsonl');
    writeFileSync(file, `${readFileSync(join(import.meta.dirname, '..', '..', 'fixtures', 'codex-inflight', 'wait-sequence.jsonl'), 'utf8').trim().split('\n').slice(0, 5).join('\n')}\n`);
    assert.deepEqual(await new CodexTranscripts(fsPathOf(dir)).inFlight.read(sourcePathOf(file), BUDGET), { kind: 'in-flight', count: runningOf(1), background: [] });
}));

test('codex: a turn ended by task_complete or turn_aborted, or an open turn with no call, is not in flight', async () => {
    for (const name of ['complete-exec.jsonl', 'turn-ended.jsonl', 'open-turn.jsonl']) {
        assert.deepEqual(await codexFlight(name), { kind: 'in-flight', count: runningOf(0), background: [] }, name);
    }
});

test('codex: an open call of an earlier turn is ignored once a newer turn starts and closes its own call', () => scratch(async (dir) => {
    const file = join(dir, 'rollout.jsonl');
    writeFileSync(file, [
        rowOf({ type: 'event_msg', payload: { type: 'task_started', turn_id: 'turn-1' } }),
        rowOf({ type: 'response_item', payload: { type: 'function_call', call_id: 'call-old', name: 'exec', arguments: 'x' } }),
        rowOf({ type: 'event_msg', payload: { type: 'task_started', turn_id: 'turn-2' } }),
        rowOf({ type: 'response_item', payload: { type: 'function_call', call_id: 'call-new', name: 'exec', arguments: 'x' } }),
        rowOf({ type: 'response_item', payload: { type: 'function_call_output', call_id: 'call-new', output: 'done' } }),
    ].join(''));
    const reader = new CodexTranscripts(fsPathOf(dir));
    assert.deepEqual(await reader.inFlight.read(sourcePathOf(file), BUDGET), { kind: 'in-flight', count: runningOf(0), background: [] });
}));

async function opencodeFlight(build: (add: (row: AddMessage) => void) => void, session = 'ses_new', budget = 1): Promise<InFlightResult> {
    const dir = mkdtempSync(join(tmpdir(), 'e2e-flight-'));
    const fixture = opencodeFixture(dir);
    try {
        build((message) => { fixture.add(message); });
        const { inFlight } = new OpencodeTranscripts(fsPathOf(fixture.db));
        return await inFlight.read(sourcePathOf(`${fixture.db}#${session}`), countOf(budget));
    } finally {
        fixture.close();
        rmSync(dir, { recursive: true, force: true });
    }
}

test('opencode: all its in-flight work is foreground, and the capability says so by name', () => {
    const { inFlight } = underScratchHome(() => new OpencodeTranscripts());
    if (inFlight.split.kind !== 'foreground-only') {
        throw new Error('opencode declares foreground-only');
    }
    assert.equal(inFlight.split.why, 'opencode-parts');
    assert.equal(splitReason(inFlight.split.why, must(parseText('opencode'))), 'opencode cannot tell background work that survives a compaction');
});

test('opencode: running and pending tool parts count; completed and error parts do not', async () => {
    const found = await opencodeFlight((add) => {
        add({ id: 'msg-completed', session: 'ses_new', role: 'assistant', updated: 100, parts: [toolPart('completed', { time: { start: 1, end: 2 } })] });
        add({ id: 'msg-error', session: 'ses_new', role: 'assistant', updated: 110, parts: [toolPart('error', { error: 'x' })] });
        add({ id: 'msg-running', session: 'ses_new', role: 'assistant', updated: 120, data: { finish: null }, parts: [toolPart('running', { input: { command: 'x' }, time: { start: 3 } })] });
        add({ id: 'msg-pending', session: 'ses_new', role: 'assistant', updated: 130, data: { finish: 'stop' }, parts: [toolPart('pending', { input: { command: 'x' } })] });
    });
    assert.deepEqual(found, { kind: 'in-flight', count: runningOf(2), background: [] });
});

test('opencode: a running part that has only a start time counts', async () => {
    const found = await opencodeFlight((add) => { add({ id: 'msg-running', session: 'ses_new', role: 'assistant', updated: 100, data: { finish: null }, parts: [toolPart('running', { time: { start: 3 } })] }); });
    assert.deepEqual(found, { kind: 'in-flight', count: runningOf(1), background: [] });
});

test('opencode: a running part of another session is not counted', async () => {
    const found = await opencodeFlight((add) => {
        add({ id: 'msg-current', session: 'ses_new', role: 'assistant', updated: 100, parts: [toolPart('pending')] });
        add({ id: 'msg-other', session: 'ses_other', role: 'assistant', updated: 110, parts: [toolPart('running')] });
        add({ id: 'msg-other-2', session: 'ses_other', role: 'assistant', updated: 120, parts: [toolPart('running')] });
    }, 'ses_new', 10);
    assert.deepEqual(found, { kind: 'in-flight', count: runningOf(1), background: [] });
});

test('opencode: a running part in a message older than the newest messages is not counted', async () => {
    const found = await opencodeFlight((add) => {
        add({ id: 'msg-old', session: 'ses_new', role: 'assistant', updated: 100, parts: [toolPart('running')] });
        for (let index = 0; index < 400; index += 1) {
            add({ id: `msg-new-${index}`, session: 'ses_new', role: 'assistant', updated: 200 + index, parts: [] });
        }
    });
    assert.deepEqual(found, { kind: 'in-flight', count: runningOf(0), background: [] });
});

test('opencode: a running-looking part that is not a tool is not counted', async () => {
    const found = await opencodeFlight((add) => { add({ id: 'msg-current', session: 'ses_new', role: 'assistant', updated: 100, parts: [{ type: 'text', state: { status: 'running' } }] }); }, 'ses_new', 10);
    assert.deepEqual(found, { kind: 'in-flight', count: runningOf(0), background: [] });
});

test('opencode: a database that cannot be opened is unknown', () => scratch(async (dir) => {
    const reader = new OpencodeTranscripts(fsPathOf(join(dir, 'missing.db')));
    const found = await reader.inFlight.read(sourcePathOf(`${dir}/missing.db#ses-1`), countOf(1));
    assert.equal(found.kind, 'unknown');
}));

async function newestPrompt(from: string, kind: 'claude' | 'codex'): Promise<{ readonly text: string | null }> {
    const world = sourceWorld();
    try {
        const reader = kind === 'claude' ? new ClaudeTranscripts(fsPathOf(join(world.dir, 'claude'))) : new CodexTranscripts(fsPathOf(join(world.dir, 'codex')));
        const file = kind === 'claude' ? world.claudeFile('s1', from) : world.codexFile(from);
        const found = await reader.latestPrompt(sourcePathOf(file), BUDGET);
        if (found.kind !== 'prompt') {
            throw new Error('the reader answers with a prompt');
        }
        return { text: found.text };
    } finally {
        world.dispose();
    }
}

test('claude: the newest prompt of a wrapped multi-line paste comes back as the text that was sent', async () => {
    assert.equal((await newestPrompt('claude-prompt-user.jsonl', 'claude')).text, BODY);
});

test('claude: with no user row in the tail, a wrapped last-prompt record is unwrapped too', async () => {
    assert.equal((await newestPrompt('claude-prompt-last.jsonl', 'claude')).text, BODY);
});

test('claude: a wrapped prompt sent as the newest queued command is unwrapped too', async () => {
    assert.equal((await newestPrompt('claude-prompt-queued.jsonl', 'claude')).text, BODY);
});

test('claude: only the newest prompt of the tail counts, and a tail with none gives none, not the old one', () => scratch(async (dir) => {
    mkdirSync(join(dir, 'proj'));
    const file = join(dir, 'proj', 's1.jsonl');
    writeFileSync(file, `${user('very old prompt')}${reply('x'.repeat(300)).repeat(200)}${user('first of the turn')}${reply('ok')}${user('the newest prompt')}${reply('on it')}`);
    const reader = new ClaudeTranscripts(fsPathOf(dir));
    assert.deepEqual(await reader.latestPrompt(sourcePathOf(file), countOf(4000)), { kind: 'prompt', text: 'the newest prompt' });
    assert.deepEqual(await reader.latestPrompt(sourcePathOf(file), countOf(100)), { kind: 'prompt', text: null });
    assert.equal((await reader.latestPrompt(sourcePathOf(join(dir, 'no-such-file')), countOf(100))).kind, 'unknown');
    const chunk = await reader.read(sourcePathOf(file), UNREAD, countOf(1 << 20));
    assert.equal(chunk.kind === 'chunk' ? chunk.entries.filter((entry) => entry.role === 'user').length : 0, 3, 'the recap read still sees everything from its own cursor');
}));

test('codex: the newest prompt is the newest user message of the rollout, not the injected context', async () => {
    assert.equal((await newestPrompt('codex-prompts.jsonl', 'codex')).text, 'second question');
});

test('opencode: the newest prompt is the newest user message of the session without injected text; a session of only agent messages has none', () => scratch(async (dir) => {
    const fixture = opencodeFixture(dir);
    fixture.add({ id: 'm1', session: 'ses_new', role: 'user', updated: 100, parts: [{ type: 'text', text: textOf('first') }] });
    fixture.add({ id: 'm2', session: 'ses_new', role: 'assistant', updated: 110, parts: [{ type: 'text', text: 'reply' }] });
    fixture.add({ id: 'm3', session: 'ses_new', role: 'user', updated: 120, parts: [{ type: 'text', text: textOf('second') }, { type: 'text', text: textOf('injected'), synthetic: true }] });
    fixture.add({ id: 'm4', session: 'ses_new', role: 'assistant', updated: 130, parts: [{ type: 'tool', tool: 'bash', state: { input: { command: 'ls' } } }] });
    fixture.add({ id: 'm5', session: 'ses_old', role: 'assistant', updated: 20, parts: [{ type: 'text', text: 'only me' }] });
    fixture.close();
    const reader = new OpencodeTranscripts(fsPathOf(fixture.db));
    assert.deepEqual(await reader.latestPrompt(sourcePathOf(`${fixture.db}#ses_new`)), { kind: 'prompt', text: 'second' });
    assert.deepEqual(await reader.latestPrompt(sourcePathOf(`${fixture.db}#ses_old`)), { kind: 'prompt', text: null });
    assert.equal((await new OpencodeTranscripts(fsPathOf(join(dir, 'missing.db'))).latestPrompt(sourcePathOf('x#y'))).kind, 'unknown');
}));

test('the live prompt of a lane is reported once, and again only when the newest prompt changes', async () => {
    const world = sourceWorld();
    try {
        const file = world.claudeFile('s1', 'claude-prompt-user.jsonl');
        const reader = new ClaudeTranscripts(fsPathOf(join(world.dir, 'claude')));
        const prompts = new LivePrompts(registryOf([reader]));
        const lane = world.lane('claude', { session: 's1' });
        assert.equal(prompts.of(lane.pane), null);
        assert.equal(await prompts.refresh(lane), 'present');
        assert.equal(prompts.of(lane.pane), BODY);
        assert.equal(await prompts.refresh(lane), 'absent');
        appendFileSync(file, `${JSON.stringify({ type: 'user', message: { content: 'a newer one' } })}\n`);
        assert.equal(await prompts.refresh(lane), 'present');
        assert.equal(prompts.of(lane.pane), 'a newer one');
    } finally {
        world.dispose();
    }
});

test('the column shows the newest prompt the engine read for a working lane', { timeout: 30_000 }, async () => {
    await withWorld({ now: NOW, version: VERSION }, async (world) => {
        const source = sourceWorld({ store: world.store, tab: 'w1:t1', pane: 'w1:p1' });
        try {
            source.claudeFile('s1', 'claude-session.jsonl');
            const engine = source.engineOver(registryOf([new ClaudeTranscripts(fsPathOf(join(source.dir, 'claude')))]));
            await engine.refresh(source.scope, [source.seat('claude', { session: 's1' })]);
            showTab(world, [{ pane: 'w1:p1', agent: 'claude', status: 'working', title: 'Fix the parser' }]);
            const pane = await world.pane({ cols: 80, rows: 30, role: 'column' });
            try {
                const screen = await pane.painted((shown) => shown.text.includes('› why does the build fail?'), 'the column shows the newest prompt');
                assert.match(screen.text, /working/u);
            } finally {
                await pane.close();
            }
        } finally {
            source.dispose();
        }
    });
});

test('the column shows the live prompt of a lane the daemon read from the transcript tail', { timeout: 30_000 }, async () => {
    await withWorld({ now: NOW, version: VERSION }, async (world) => {
        const source = sourceWorld();
        try {
            source.claudeFile('s1', 'claude-prompt-user.jsonl');
            const prompts = new LivePrompts(registryOf([new ClaudeTranscripts(fsPathOf(join(source.dir, 'claude')))]));
            const lane = source.lane('claude', { session: 's1', pane: 'w1:p1' });
            await prompts.refresh(lane);
            showTab(world, [{ pane: 'w1:p1', agent: 'claude', status: 'working', title: 'Refactor', lastPrompt: prompts.of(lane.pane) }]);
            showRecap(world, { at: NOW - 60_000, sections: sections({ goal: 'Refactor the parser' }), lanes: [{ pane: 'w1:p1', agent: 'claude', title: 'Refactor', lastPrompt: null }] });
            const pane = await world.pane({ cols: 80, rows: 30, role: 'column' });
            try {
                const screen = await pane.painted((shown) => shown.text.includes('Handoff of the parser refactor.'), 'the column shows the live prompt');
                assert.match(screen.text, /› Handoff of the parser refactor\./u);
            } finally {
                await pane.close();
            }
        } finally {
            source.dispose();
        }
    });
});
