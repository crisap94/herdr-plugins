import { must } from '@stateforge-labs/session-ledger';
import { parseText, textOf } from '@stateforge-labs/session-ledger';
import { en } from '#src/i18n/en.ts';
import { compactionPlanner } from '#src/adapters/capability/compaction-plans.ts';
import { Compaction } from '#src/recap/application/compaction.ts';
import type { CompactionPorts } from '#src/recap/application/compaction-deps.ts';
import { LaneClaims } from '#src/recap/application/lane-claims.ts';
import { targetOf } from '@stateforge-labs/session-ledger';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { NO_SECTIONS } from '@stateforge-labs/session-ledger';
import type { Mark } from '@stateforge-labs/session-ledger';
import type { AgentPanes, AgentLookup, LineBehavior, PromptStance, PromptWaitFor, Prompted } from '#src/ports/agents.ts';
import { blankRecap } from '@stateforge-labs/session-ledger';
import { unknown } from '@stateforge-labs/session-ledger';
import type { LaneSettler } from '#src/ports/lane-settling.ts';
import { memoryStore } from '#test/db/support.ts';
import { lineBreakRefusal } from '#test/fakes/typed-line.ts';
import { oneTask } from '#test/support.ts';
import { instant } from '@stateforge-labs/session-ledger';
import { tabId, paneId, agentKind } from '#test/support/ids.ts';
import { seenLane } from '#test/support/seen.ts';

export const lane = (pane: string, agent: string): Lane => laneFrom(seenLane({ paneId: pane, tabId: 'w1:t1', workspaceId: 'w1', agent }));
export const CLAUDE_CODEX_GEMINI = [lane('w1:p1', 'claude'), lane('w1:p2', 'codex'), lane('w1:p3', 'gemini')];

export interface Typed { readonly pane: string; readonly text: string; readonly pieces?: readonly string[]; readonly wait?: PromptWaitFor | undefined; readonly lineBehavior?: LineBehavior; readonly promptBehavior?: PromptStance; readonly typed?: boolean }

export interface Fleet {
    readonly agents: AgentPanes;
    readonly typed: Typed[];
    readonly toasts: string[];
    readonly events: string[];
    readonly store: ReturnType<typeof memoryStore>;
    readonly settling: LaneSettler;
    readonly settledAfter: string[];
    readonly laneEvents: string[];
    readonly answered: string[];
    readonly claims: LaneClaims;
    refreshFails: boolean;
    readonly pauses: number[];
}

export function typingFleet(statuses: Record<string, string>, blocked: readonly string[] = []): Fleet {
    const typed: Typed[] = [];
    const toasts: string[] = [];
    const events: string[] = [];
    const settledAfter: string[] = [];
    const store = memoryStore();
    store.db.prepare("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 1)").run();
    const settling: LaneSettler = { settled: (pane) => { settledAfter.push(`${pane}: after ${events.join(',')}`); return Promise.resolve({ kind: 'settled', status: 'done' }); } };
    const agents: AgentPanes = {
        status: (pane): Promise<AgentLookup> => Promise.resolve(statuses[pane] === undefined ? unknown({ why: 'not-found', what: textOf(pane) }) : { kind: 'agent', agent: agentKind('x'), status: statuses[pane] as 'idle' }),
        prompt: (pane, text, wait, behavior): Promise<Prompted> => {
            events.push(`prompt ${pane}`);
            typed.push({ pane, text, wait, promptBehavior: behavior });
            return Promise.resolve(blocked.includes(pane) ? { kind: 'blocked' } : { kind: 'sent' });
        },
        typeLine: (pane, line, behavior): Promise<Prompted> => {
            const refused = lineBreakRefusal(line);
            if (refused !== null) return Promise.resolve(refused);
            events.push(`type ${pane}`);
            const pieces = line.pieces.map(String);
            typed.push({ pane, text: pieces.join(''), pieces, lineBehavior: behavior, typed: true });
            return Promise.resolve(blocked.includes(pane) ? { kind: 'blocked' } : { kind: 'sent' });
        },
        askNote: () => Promise.resolve({ kind: 'done' }),
    };
    return { agents, typed, toasts, events, store, settling, settledAfter, laneEvents: [], answered: [], claims: new LaneClaims(), refreshFails: false, pauses: [] };
}

export const NOW = Date.parse('2026-10-07T10:00:00Z');
export const compacted: Mark = { kind: 'compacted', at: instant(NOW + 5000) };
export const failed: Mark = { kind: 'compaction-failed', at: instant(NOW + 5000) };

export function compactionDeps(world: Fleet, setting = 'focused', focused: string | null = 'w1:p1', reads: readonly (readonly Mark[])[] = [[]], lanes: readonly Lane[] = CLAUDE_CODEX_GEMINI): CompactionPorts {
    let looked = 0;
    const recap = { ...blankRecap(tabId('w1:t1')), tasks: oneTask('x', { ...NO_SECTIONS, goal: textOf('Ship the cart rewrite'), decisions: [textOf('The recap column shows three lines')], rules: [textOf('Never push to main')] }, ['w1:p1', 'w1:p2']) };
    return {
        compactionPlans: compactionPlanner,
        agents: world.agents,
        notifier: { notify: (title, body) => { world.toasts.push(`${title} | ${body}`); return Promise.resolve({ kind: 'shown' }); } },
        records: { readRecap: () => recap },
        ledger: { historyOf: () => [] },
        boundaries: { lastBreakAt: () => null },
        compactions: world.store.compactions,
        settling: world.settling,
        brief: { enabled: () => 'absent', job: () => null, write: () => Promise.resolve({ text: null, why: must(parseText('the job is off')) }) },
        recent: () => Promise.resolve([{ role: 'user', text: textOf('run the tests') }]),
        now: () => instant(NOW),
        marks: () => { const shown = reads[Math.min(looked, reads.length - 1)] ?? []; looked += 1; return Promise.resolve(shown); },
        pause: (ms) => { world.pauses.push(ms); return Promise.resolve(); },
        webs: { of: () => null },
        lanes: () => lanes,
        listsPane: () => 'present',
        focused: () => Promise.resolve(focused === null ? null : paneId(focused)),
        refresh: () => { world.events.push('refresh'); return world.refreshFails ? Promise.reject(new Error('refresh failed')) : Promise.resolve('refreshed'); },
        coverage: () => null,
        decisions: null,
        target: () => targetOf(setting),
        messages: () => en,
        log: () => undefined,
        claims: world.claims,
        answer: (id, pane, stage) => { world.answered.push(`${id} ${pane} ${stage}`); },
        events: { lane: (pane, kind, detail) => { world.laneEvents.push(`${pane} ${kind}${detail === undefined || detail === null ? '' : ` ${detail}`}`); }, inWorkspace: () => undefined },
    };
}

export function compactionFlow(world: Fleet, setting = 'focused', focused: string | null = 'w1:p1', reads: readonly (readonly Mark[])[] = [[]], lanes: readonly Lane[] = CLAUDE_CODEX_GEMINI): Compaction {
    return new Compaction(compactionDeps(world, setting, focused, reads, lanes));
}
