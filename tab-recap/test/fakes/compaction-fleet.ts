// A fleet of fake agents and the compaction flow over it, for the tests that pin what is typed into each kind of agent.
// The same shape as the helpers in `test/compaction.test.ts`, which stays as it is; this copy adds the pauses and the lanes.
import { en } from '#src/i18n/en.ts';
import { Compaction } from '#src/recap/application/compaction.ts';
import type { CompactionDeps } from '#src/recap/application/compaction.ts';
import { CompactionClaims } from '#src/recap/application/compaction-claims.ts';
import { targetOf } from '#src/recap/domain/compaction.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import type { Mark } from '#src/ports/transcripts.ts';
import type { Agents, AgentState, PromptWait, Prompted } from '#src/ports/agents.ts';
import { blankRecap } from '#src/ports/recap-records.ts';
import { unknown } from '#src/ports/unknowable.ts';
import type { LaneSettling } from '#src/ports/lane-settling.ts';
import { memoryStore } from '#test/db/support.ts';
import { oneTask } from '#test/support.ts';

export const lane = (pane: string, agent: string): Lane => laneFrom({ paneId: pane, tabId: 'w1:t1', workspaceId: 'w1', agent });
export const CLAUDE_CODEX_GEMINI = [lane('w1:p1', 'claude'), lane('w1:p2', 'codex'), lane('w1:p3', 'gemini')];

export interface Typed { readonly pane: string; readonly text: string; readonly pieces?: readonly string[]; readonly wait?: PromptWait | undefined; readonly typed?: boolean }

export interface Fleet {
    readonly agents: Agents;
    readonly typed: Typed[];
    readonly toasts: string[];
    readonly events: string[];
    readonly store: ReturnType<typeof memoryStore>;
    readonly settling: LaneSettling;
    readonly settledAfter: string[];
    readonly laneEvents: string[];
    readonly answered: string[];
    readonly claims: CompactionClaims;
    refreshFails: boolean;
    /** the pauses the flow asked for, in milliseconds: a confirmation that polls shows here */
    readonly pauses: number[];
}

/** A fleet of fake agents: what each reports, what was typed into it, and what happened around it. */
export function fleet(statuses: Record<string, string>, blocked: readonly string[] = []): Fleet {
    const typed: Typed[] = [];
    const toasts: string[] = [];
    const events: string[] = [];
    const settledAfter: string[] = [];
    const store = memoryStore();
    store.db.prepare("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 1)").run();
    const settling: LaneSettling = { settled: (pane) => { settledAfter.push(`${pane}: after ${events.join(',')}`); return Promise.resolve({ kind: 'settled', status: 'done' }); } };
    const agents: Agents = {
        status: (pane): Promise<AgentState> => Promise.resolve(statuses[pane] === undefined ? unknown({ why: 'not-found', what: pane }) : { kind: 'agent', agent: 'x', status: statuses[pane] as 'idle' }),
        prompt: (pane, text, wait): Promise<Prompted> => {
            events.push(`prompt ${pane}`);
            typed.push({ pane, text, wait });
            return Promise.resolve(blocked.includes(pane) ? { kind: 'blocked' } : { kind: 'sent' });
        },
        typeLine: (pane, pieces): Promise<Prompted> => {
            events.push(`type ${pane}`);
            typed.push({ pane, text: pieces.join(''), pieces, typed: true });
            return Promise.resolve(blocked.includes(pane) ? { kind: 'blocked' } : { kind: 'sent' });
        },
        askNote: () => Promise.resolve({ kind: 'done' }),
    };
    return { agents, typed, toasts, events, store, settling, settledAfter, laneEvents: [], answered: [], claims: new CompactionClaims(), refreshFails: false, pauses: [] };
}

export const NOW = Date.parse('2026-10-07T10:00:00Z');
export const compacted: Mark = { kind: 'compacted', at: NOW + 5000 };
export const failed: Mark = { kind: 'compaction-failed', at: NOW + 5000 };

/** The compaction's dependencies over a fleet. `reads`: what the agent's records show each time they are looked at; the last one repeats. */
export function depsOf(world: Fleet, setting = 'focused', focused: string | null = 'w1:p1', reads: readonly (readonly Mark[])[] = [[]], lanes: readonly Lane[] = CLAUDE_CODEX_GEMINI): CompactionDeps {
    let looked = 0;
    const recap = { ...blankRecap('w1:t1'), tasks: oneTask('x', { ...NO_SECTIONS, goal: 'Ship the cart rewrite', decisions: ['The recap column shows three lines'], rules: ['Never push to main'] }, ['w1:p1', 'w1:p2']) };
    return {
        agents: world.agents,
        notifier: { notify: (title, body) => { world.toasts.push(`${title} | ${body}`); return Promise.resolve({ kind: 'shown' }); } },
        records: { readRecap: () => recap },
        ledger: { historyOf: () => [] },
        boundaries: { lastBreakAt: () => null },
        compactions: world.store.compactions,
        settling: world.settling,
        brief: { enabled: () => false, job: () => null, write: () => Promise.resolve({ text: null, why: 'the job is off' }) },
        recent: () => Promise.resolve([{ role: 'user', text: 'run the tests' }]),
        now: () => NOW,
        marks: () => { const shown = reads[Math.min(looked, reads.length - 1)] ?? []; looked += 1; return Promise.resolve(shown); },
        pause: (ms) => { world.pauses.push(ms); return Promise.resolve(); },
        webs: { of: () => null },
        lanes: () => lanes,
        focused: () => Promise.resolve(focused),
        refresh: () => { world.events.push('refresh'); return world.refreshFails ? Promise.reject(new Error('refresh failed')) : Promise.resolve(); },
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

/** The compaction flow over a fleet, as `Compaction.run` sees it. */
export function flow(world: Fleet, setting = 'focused', focused: string | null = 'w1:p1', reads: readonly (readonly Mark[])[] = [[]], lanes: readonly Lane[] = CLAUDE_CODEX_GEMINI): Compaction {
    return new Compaction(depsOf(world, setting, focused, reads, lanes));
}
