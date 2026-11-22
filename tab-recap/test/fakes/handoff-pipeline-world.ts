import assert from 'node:assert/strict';
import { textOf as asText } from '#src/recap/domain/text.ts';
import type { HandoffPipelineDeps } from '#src/recap/application/handoff-pipeline.ts';
import type { HandoffLane, HandoffRenderInput, HandoffRenderResult } from '#src/recap/application/handoff-render.ts';
import { agentKind, handoffId, paneId, tabId } from '#src/recap/domain/ids.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import type { LaneCursor, LastRun } from '#src/ports/recap-records.ts';
import type { Entry, Transcripts } from '#src/ports/transcripts.ts';
import type { WorksiteReaderPort } from '#src/ports/worksite-reader.ts';
import { fact } from './fact-at.ts';
import { MemoryWorksite } from './worksite-reader.ts';
import { registryWith } from './transcript-registry.ts';
import { cursorOf, grewOf, sourcePathOf } from '#src/ports/transcripts.ts';
import { runningOf } from '#src/recap/domain/in-flight.ts';
import { brand } from '#src/recap/domain/brand.ts';
import { instant } from '#src/recap/domain/time.ts';

export const NOW = Date.parse('2026-10-11T10:00:00Z');
export const ID = handoffId(asText('hnd_01j3tt8z1efcd9tfr14d2pf2db'));
export const OTHER_ID = handoffId(asText('hnd_01j3tt8z1efcd9tfr14d2pf2dc'));
export const SOURCE_FILE = 'session.jsonl';
export const LAST_RUN: LastRun = { at: instant(NOW - 60_000), cause: 'turn-ended' };
export const LANE: HandoffLane = { tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude'), status: 'idle', cwd: '/repo' };
export const CURSOR: LaneCursor = { pane: paneId('w1:p1'), agent: agentKind('claude'), transcript: sourcePathOf(SOURCE_FILE), cursor: cursorOf(0), tail: null, title: null, lastPrompt: null, claudeRecap: null };

export const FACTS: readonly Fact[] = [
    fact('g1', 'goal', 'Ship the parser', NOW - 5_000),
    fact('n1', 'now', 'Writing the tests', NOW - 4_000),
    fact('q1', 'needs', 'Confirm the schema', NOW - 3_500),
    fact('x1', 'done', 'Scaffolded the module', NOW - 2_000),
    fact('d1', 'decisions', 'Use the existing lexer', NOW - 3_000, { why: brand<string, 'Text'>('it already handles the edge cases') }),
    fact('t1', 'next', 'Run the gate', NOW - 500),
    fact('l1', 'links', 'See the design note', NOW - 1_500),
    fact('k1', 'rules', 'Keep the public API stable', NOW - 1_000),
    fact('c1', 'rules', 'Old rule', NOW - 3_600_000, { state: 'closed', closedAt: instant(NOW - 3_600_000), closedWhy: 'superseded' }),
];

export function claudeReader(prompts: number): Transcripts {
    const entries: Entry[] = Array.from({ length: prompts }, (_, index): Entry => ({ role: 'user', text: brand<string, 'Text'>(`prompt ${index}`) }));
    return {
        agent: agentKind('claude'),
        inFlight: { kind: 'supported', split: { kind: 'foreground-only', why: 'codex-cells' }, read: async () => ({ kind: 'in-flight', count: runningOf(0), background: [] }) },
        locate: async () => ({ kind: 'located', source: sourcePathOf(SOURCE_FILE) }),
        read: async () => ({ kind: 'chunk', entries, title: null, lastPrompt: null, claudeRecap: null, notes: [], position: { cursor: cursorOf(0), tail: null }, grew: grewOf(false) }),
        latestPrompt: async () => ({ kind: 'prompt', text: null }),
    };
}

export function worksiteWith(): MemoryWorksite {
    const worksite = new MemoryWorksite();
    worksite.set('/repo', { commit: { hash: 'abc1234', subject: 'Add parser' }, paths: ['src/a.ts'] });
    return worksite;
}

export function depsOf(over: { readonly lastRun?: LastRun | null; readonly reader?: WorksiteReaderPort } = {}): HandoffPipelineDeps {
    return {
        records: { lastRunOf: () => (over.lastRun === undefined ? LAST_RUN : over.lastRun) },
        transcripts: registryWith({ claude: claudeReader(2) }),
        log: () => undefined,
        locate: async () => SOURCE_FILE,
        worksite: { reader: over.reader ?? worksiteWith(), repo: { repoOf: async () => ({ kind: 'no-repo' }) }, edits: { of: async () => [] } },
        tokens: { read: async () => ({ kind: 'tokens', tokens: new Map() }) },
    };
}

export function inputOf(over: Partial<HandoffRenderInput> = {}): HandoffRenderInput {
    return { handoff: ID, at: NOW, lane: LANE, cursor: CURSOR, facts: FACTS, note: null, refresh: 'not-requested', ...over };
}

export async function textOf(result: HandoffRenderResult): Promise<string> {
    return result.kind === 'text' ? result.text : assert.fail(`refused ${result.reason}`);
}

