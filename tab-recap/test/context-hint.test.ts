import { test } from 'node:test';
import { registryWith } from '#test/fakes/transcript-registry.ts';
import assert from 'node:assert/strict';
import { en } from '#src/i18n/en.ts';
import { es } from '#src/i18n/es.ts';
import { present } from '#src/recap/render/present.ts';
import { LaneContexts } from '#src/recap/application/lane-contexts.ts';
import { contextWindows } from '#src/adapters/context-window.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { ContextUse } from '#src/recap/domain/compaction.ts';
import type { Transcripts } from '#src/ports/transcripts.ts';
import type { ModelCatalogue } from '#src/ports/model-catalogue.ts';
import { memoryStore } from './db/support.ts';

const noGlow = (): null => null;
const view = (context: ContextUse | null, compactHint: number | null, messages: typeof en = en): string => present({
    tab: { tab: 'w1:t1', column: null, at: 0, lanes: [{ pane: 'w1:p1', agent: 'codex', status: 'idle', title: 'Fix it', cwd: null, context }] },
    recap: null, notes: new Map(), warnings: [], now: 0, messages, compactHint,
}, 60, noGlow).join('\n');

test('a lane header shows the hint with the percentage and the window it was measured against once the threshold is reached', () => {
    const use: ContextUse = { tokens: 116_280, window: 258_400, source: 'agent' };
    assert.match(view(use, 40), /compact\? 45% of 258k/);
    assert.match(view({ tokens: 450_000, window: 1_000_000, source: 'table' }, 40), /compact\? 45% of 1M/);
    assert.match(view(use, 40, es), /¿compactar\? 45% de 258k/);
    assert.ok(!view({ ...use, tokens: 100_000 }, 40).includes('compact?'), 'under the threshold: nothing');
    assert.ok(!view(use, null).includes('compact?'), 'hint off: nothing');
    assert.ok(!view(null, 40).includes('compact?'), 'unknown use: nothing');
    assert.ok(!view(use, 50).includes('compact?'), 'the threshold is the operator\'s');
});

const lane = (agent: string): ReturnType<typeof laneFrom> => laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent, cwd: '/w' });

function reader(agent: string, model: string | null, tokens: number, window: number | null): Transcripts {
    return {
        agent,
        inFlight: { kind: 'unsupported', why: 'unregistered-reader' },
        locate: () => Promise.resolve({ kind: 'located', source: 's' }),
        read: () => Promise.reject(new Error('not used')),
        latestPrompt: () => Promise.reject(new Error('not used')),
        observed: () => Promise.resolve({ kind: 'observed', observed: { tokens, peak: tokens, window, model } }),
    };
}
const catalogue = (windows: Record<string, number>): ModelCatalogue => ({ windowOf: (model) => windows[model] ?? null });

test('lane contexts: runtime window first, the setting overrides, a change is reported once', async () => {
    const claude = new LaneContexts(registryWith({ claude: reader('claude', 'claude-opus-5-5', 450_000, null) }), contextWindows(catalogue({ 'claude-opus-5-5': 1_000_000 })), () => null);
    assert.equal(await claude.refresh(lane('claude')), true);
    assert.deepEqual(claude.of('w1:p1'), { tokens: 450_000, window: 1_000_000, source: 'catalogue' });
    assert.equal(await claude.refresh(lane('claude')), false, 'the same answer is no change');
    const codex = new LaneContexts(registryWith({ codex: reader('codex', 'gpt-6-luna', 116_000, 258_400) }), contextWindows(catalogue({})), () => null);
    await codex.refresh(lane('codex'));
    assert.equal(codex.of('w1:p1')?.source, 'agent');
    const set = new LaneContexts(registryWith({ claude: reader('claude', 'claude-opus-5-5', 450_000, null) }), contextWindows(catalogue({})), () => 500_000);
    await set.refresh(lane('claude'));
    assert.deepEqual(set.of('w1:p1'), { tokens: 450_000, window: 500_000, source: 'setting' });
    const unknownModel = new LaneContexts(registryWith({ opencode: reader('opencode', 'acme/new', 1000, null) }), contextWindows(catalogue({})), () => null);
    assert.equal(await unknownModel.refresh(lane('opencode')), false);
    assert.equal(unknownModel.of('w1:p1'), null, 'a model nothing knows has no hint');
});

test('a lane keeps its context use through the database: stored with the view, read back whole', () => {
    const { views } = memoryStore();
    const use: ContextUse = { tokens: 450_000, window: 1_000_000, source: 'observed' };
    views.writeTab({ tab: 'w1:t1', column: null, at: 5, lanes: [{ pane: 'w1:p1', agent: 'claude', status: 'idle', title: null, cwd: null, context: use }, { pane: 'w1:p2', agent: 'codex', status: 'idle', title: null, cwd: null }] });
    assert.deepEqual(views.readTab('w1:t1')?.lanes.map((each) => each.context), [use, null]);
});
