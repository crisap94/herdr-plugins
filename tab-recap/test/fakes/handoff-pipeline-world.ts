import assert from 'node:assert/strict';
import type { HandoffPipelineDeps } from '#src/recap/application/handoff-pipeline.ts';
import type { HandoffLane, HandoffRenderInput, HandoffRenderResult } from '#src/recap/application/handoff-render.ts';
import { agentKind, handoffId, paneId, tabId } from '#src/recap/domain/ids.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import type { LaneCursor, LastRun } from '#src/ports/recap-records.ts';
import type { Entry, Transcripts } from '#src/ports/transcripts.ts';
import type { WorksiteReader } from '#src/ports/worksite-reader.ts';
import { fact } from './fact-at.ts';
import { MemoryWorksite } from './worksite-reader.ts';
import { registryWith } from './transcript-registry.ts';

export const NOW = Date.parse('2026-10-11T10:00:00Z');
export const ID = handoffId('hnd_01j3tt8z1efcd9tfr14d2pf2db');
export const OTHER_ID = handoffId('hnd_01j3tt8z1efcd9tfr14d2pf2dc');
export const SOURCE_FILE = 'session.jsonl';
export const LAST_RUN: LastRun = { at: NOW - 60_000, cause: 'turn-ended' };
export const LANE: HandoffLane = { tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude'), status: 'idle', cwd: '/repo' };
export const CURSOR: LaneCursor = { pane: 'w1:p1', agent: 'claude', transcript: SOURCE_FILE, cursor: 0, tail: null, title: null, lastPrompt: null, claudeRecap: null };

export const FACTS: readonly Fact[] = [
    fact('g1', 'goal', 'Ship the parser', NOW - 5_000),
    fact('n1', 'now', 'Writing the tests', NOW - 4_000),
    fact('q1', 'needs', 'Confirm the schema', NOW - 3_500),
    fact('x1', 'done', 'Scaffolded the module', NOW - 2_000),
    fact('d1', 'decisions', 'Use the existing lexer', NOW - 3_000, { why: 'it already handles the edge cases' }),
    fact('t1', 'next', 'Run the gate', NOW - 500),
    fact('l1', 'links', 'See the design note', NOW - 1_500),
    fact('k1', 'rules', 'Keep the public API stable', NOW - 1_000),
    fact('c1', 'rules', 'Old rule', NOW - 3_600_000, { state: 'closed', closedAt: NOW - 3_600_000, closedWhy: 'superseded' }),
];

export function claudeReader(prompts: number): Transcripts {
    const entries: Entry[] = Array.from({ length: prompts }, (_, index): Entry => ({ role: 'user', text: `prompt ${index}` }));
    return {
        agent: 'claude',
        inFlight: { kind: 'supported', read: async () => ({ kind: 'in-flight', count: 0 }) },
        locate: async () => ({ kind: 'located', source: SOURCE_FILE }),
        read: async () => ({ kind: 'chunk', entries, title: null, lastPrompt: null, claudeRecap: null, notes: [], position: { cursor: 0, tail: null }, grew: false }),
        latestPrompt: async () => ({ kind: 'prompt', text: null }),
    };
}

export function worksiteWith(): MemoryWorksite {
    const worksite = new MemoryWorksite();
    worksite.set('/repo', { commit: { hash: 'abc1234', subject: 'Add parser' }, paths: ['src/a.ts'] });
    return worksite;
}

export function depsOf(over: { readonly lastRun?: LastRun | null; readonly reader?: WorksiteReader } = {}): HandoffPipelineDeps {
    return {
        records: { lastRunOf: () => (over.lastRun === undefined ? LAST_RUN : over.lastRun) },
        transcripts: registryWith({ claude: claudeReader(2) }),
        locate: async () => SOURCE_FILE,
        worksite: { reader: over.reader ?? worksiteWith(), repo: { repoOf: async () => ({ kind: 'no-repo' }) }, edits: { of: async () => [] } },
        tokens: { read: async () => ({ kind: 'tokens', tokens: {} }) },
    };
}

export function inputOf(over: Partial<HandoffRenderInput> = {}): HandoffRenderInput {
    return { handoff: ID, at: NOW, lane: LANE, cursor: CURSOR, facts: FACTS, note: null, refresh: 'not-requested', ...over };
}

export async function textOf(result: HandoffRenderResult): Promise<string> {
    return result.kind === 'text' ? result.text : assert.fail(`refused ${result.reason}`);
}

