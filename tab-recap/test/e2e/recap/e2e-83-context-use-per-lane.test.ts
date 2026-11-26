import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { countOf } from '@stateforge-labs/session-ledger';
import type { ContextUse } from '@stateforge-labs/session-ledger';
import { agentWindows } from '#src/adapters/capability/context-window.ts';
import { ClaudeTranscripts } from '#src/adapters/transcripts/claude/transcripts.ts';
import { CodexTranscripts } from '#src/adapters/transcripts/codex/transcripts.ts';
import { OpencodeTranscripts } from '#src/adapters/transcripts/opencode/transcripts.ts';
import type { ModelWindows } from '#src/ports/model-catalogue.ts';
import { LaneContexts } from '#src/recap/application/lane-contexts.ts';
import { fsPathOf } from '#test/fakes/transcript-lines.ts';
import { viewRecord } from '#test/support/tab-view-records.ts';
import { tabId } from '#test/support/ids.ts';
import { opencodeFixture, registryOf, sourceWorld, type AddMessage, type SourceWorld } from '../support/source-world.ts';

const catalogue: ModelWindows = { windowOf: () => null };

const contexts = (world: SourceWorld, readers: Parameters<typeof registryOf>[0]): LaneContexts => new LaneContexts(registryOf(readers), agentWindows(catalogue), { limitOf: () => ({ window: null, percent: null }) }, () => null);

async function claudeUse(from: string): Promise<ContextUse | null> {
    const world = sourceWorld();
    try {
        world.claudeFile('s1', from);
        const lane = world.lane('claude', { session: 's1' });
        const held = contexts(world, [new ClaudeTranscripts(fsPathOf(join(world.dir, 'claude')))]);
        await held.refresh(lane);
        return held.of(lane.pane);
    } finally {
        world.dispose();
    }
}

async function codexUse(from: string): Promise<ContextUse | null> {
    const world = sourceWorld();
    try {
        world.codexFile(from);
        const lane = world.lane('codex', { cwd: '/repo' });
        const held = contexts(world, [new CodexTranscripts(fsPathOf(join(world.dir, 'codex')))]);
        await held.refresh(lane);
        return held.of(lane.pane);
    } finally {
        world.dispose();
    }
}

test('claude: the use is the newest main-thread usage, input plus cache read plus cache creation; a sidechain row and a synthetic row do not count', async () => {
    assert.equal((await claudeUse('claude-context.jsonl'))?.tokens, 62_524);
});

test('claude: a compaction row sets the use to its post-compaction size until a newer usage row', async () => {
    assert.equal((await claudeUse('claude-context-compacted.jsonl'))?.tokens, 12_332);
});

test('claude: a usage row after the compaction is the use again', async () => {
    assert.equal((await claudeUse('claude-context-after.jsonl'))?.tokens, 20_001);
});

test('claude: a compaction row with no post-compaction size leaves the use as it was', async () => {
    assert.equal((await claudeUse('claude-context-nopost.jsonl'))?.tokens, 431_387);
});

test('codex: the use is the newest token_count total, measured against the window the agent reports', async () => {
    assert.deepEqual(await codexUse('codex-context.jsonl'), { tokens: 116_000, window: 258_400, source: 'agent' });
});

test('codex: a compacted row alone changes nothing', async () => {
    assert.equal((await codexUse('codex-context-compacted.jsonl'))?.tokens, 200_000);
});

test('codex: the token_count after a compacted row is the use', async () => {
    assert.equal((await codexUse('codex-context-after.jsonl'))?.tokens, 14_000);
});

const usedBy = (read: number, extra: Record<string, number> = {}): object => ({ providerID: 'acme', modelID: 'big-1', tokens: { input: 5, output: 5, cache: { read, write: 0, ...extra } } });

async function opencodeObserved(build: (add: (row: AddMessage) => void) => void): Promise<{ readonly observed: unknown; readonly refreshed: string; readonly use: ContextUse | null }> {
    const world = sourceWorld();
    try {
        const fixture = opencodeFixture(world.dir);
        build((row) => { fixture.add(row); });
        fixture.close();
        const reader = new OpencodeTranscripts(fsPathOf(fixture.db));
        const located = await reader.locate(world.seat('opencode', { cwd: '/repo' }));
        if (located.kind !== 'located') {
            throw new Error('the lane has a session');
        }
        const observed = await reader.observed(located.source);
        const lane = world.lane('opencode', { cwd: '/repo' });
        const held = contexts(world, [reader]);
        const refreshed = await held.refresh(lane);
        return { observed, refreshed, use: held.of(lane.pane) };
    } finally {
        world.dispose();
    }
}

test('opencode: the use is the newest assistant message of the lane\'s session with tokens, as provider and model', async () => {
    const found = await opencodeObserved((add) => {
        add({ id: 'm1', session: 'ses_new', role: 'assistant', updated: 1, parts: [], data: { providerID: 'acme', modelID: 'big-1', tokens: { input: 10, output: 5, cache: { read: 1000, write: 20 } } } });
        add({ id: 'm2', session: 'ses_new', role: 'assistant', updated: 2, parts: [], data: { providerID: 'acme', modelID: 'big-1', tokens: { input: 0, output: 0, cache: { read: 0, write: 0 } } } });
        add({ id: 'm3', session: 'ses_new', role: 'user', updated: 3, parts: [] });
    });
    assert.deepEqual(found.observed, { kind: 'observed', observed: { tokens: 1030, peak: 1030, window: null, model: 'acme/big-1' } });
});

test('opencode: a model nothing knows has no hint', async () => {
    const found = await opencodeObserved((add) => { add({ id: 'm1', session: 'ses_new', role: 'assistant', updated: 1, parts: [], data: usedBy(1000) }); });
    assert.deepEqual([found.refreshed, found.use], ['absent', null]);
});

test('opencode: a message of a subagent session does not count toward its parent', async () => {
    const found = await opencodeObserved((add) => {
        add({ id: 'm1', session: 'ses_new', role: 'assistant', updated: 1, parts: [], data: usedBy(1000) });
        add({ id: 'm2', session: 'ses_child', role: 'assistant', updated: 2, parts: [], data: usedBy(900_000) });
    });
    assert.deepEqual(found.observed, { kind: 'observed', observed: { tokens: 1005, peak: 1005, window: null, model: 'acme/big-1' } });
});

test('opencode: the compaction answer is the newest assistant message, so its size is the use', async () => {
    const found = await opencodeObserved((add) => {
        add({ id: 'm1', session: 'ses_new', role: 'assistant', updated: 1, parts: [], data: usedBy(90_000) });
        add({ id: 'm2', session: 'ses_new', role: 'assistant', updated: 2, parts: [], data: usedBy(8_000) });
    });
    assert.deepEqual(found.observed, { kind: 'observed', observed: { tokens: 8_005, peak: 8_005, window: null, model: 'acme/big-1' } });
});

test('a lane keeps its context use through the store: written with the view, read back whole', async () => {
    const world = sourceWorld();
    try {
        world.codexFile('codex-context.jsonl');
        const lane = world.lane('codex', { cwd: '/repo' });
        const held = contexts(world, [new CodexTranscripts(fsPathOf(join(world.dir, 'codex')))]);
        await held.refresh(lane);
        const context = held.of(lane.pane);
        world.store.views.writeTab(viewRecord({ tab: 'src:t1', column: null, at: 5, lanes: [{ pane: 'src:p1', agent: 'codex', status: 'idle', title: null, cwd: null, context }] }));
        assert.deepEqual(world.store.views.readTab(tabId('src:t1'))?.lanes.map((each) => each.context), [{ tokens: countOf(116_000), window: countOf(258_400), source: 'agent' }]);
    } finally {
        world.dispose();
    }
});
