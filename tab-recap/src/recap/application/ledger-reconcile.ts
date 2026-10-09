// The curator reconciling one task: its open facts against the newest turns. The curator answers updates, closes and merges, each with a
// quote of the turns; what does not hold is refused, the rest passes the writer's gates and is applied. Never an add.
import type { Curators } from '#src/ports/curators.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import type { LaneCursor } from '#src/ports/recap-records.ts';
import type { Stories } from '#src/ports/stories.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import { LEDGER_GATES } from '#src/recap/domain/gates/ledger-gates.ts';
import type { CloseOp, Operation, UpdateOp } from '#src/recap/domain/ops.ts';
import { reconciliationOf } from '#src/recap/domain/reconciliation.ts';
import type { Reconciled } from '#src/recap/domain/reconciliation.ts';
import { reconcileInput } from './curator-input.ts';
import { judge } from './ops-gating.ts';

export interface ReconcileParts {
    readonly writer: Curators;
    readonly stories: Stories;
    readonly language: string;
    readonly rubric: string;
    readonly clock: { readonly now: number; readonly zone: string };
    log(line: string): void;
}

/** The task to reconcile: its facts (all of them; only the open ones are shown) and the newest turns of its lanes. */
export interface ReconcileTask {
    readonly tab: string;
    readonly key: string;
    readonly name: string;
    readonly facts: readonly Fact[];
    readonly tail: readonly Entry[];
    /** the names of the task's agents (lower-cased): what the gates read to tell a narrator */
    readonly agents: readonly string[];
}

const operationOf = (one: Reconciled): Operation => (one.op === 'close' ? { op: 'close', id: one.id, why: one.why } : { op: 'update', id: one.id, text: one.text, why: one.why });
const changes = (ops: readonly Operation[]): readonly (UpdateOp | CloseOp)[] => ops.flatMap((op) => (op.op === 'add' ? [] : [op]));

/** One call, then what it answered, checked and applied; nothing is called when there is no open fact or no turn to read. */
export async function reconcileTask(parts: ReconcileParts, task: ReconcileTask): Promise<void> {
    const { writer, clock } = parts;
    const where = `curator ${task.tab} ${task.key}`;
    const open = task.facts.filter((fact) => fact.state === 'open');
    if (open.length === 0 || task.tail.length === 0) {
        return;
    }
    const input = reconcileInput({ name: task.name, language: parts.language, rubric: parts.rubric, open, tail: task.tail, clock });
    const answered = await writer.write(input.document, 'reconcile');
    if (isUnknown(answered)) {
        parts.log(`${where}: ${writer.backend} gave none to reconcile (${saying(answered.why)})`);
        return;
    }
    const checked = reconciliationOf(answered.text, input.facts, input.tail);
    checked.refused.forEach((why) => { parts.log(`${where}: reconcile refused — ${why}`); });
    const ground = { key: task.key, tab: task.tab, shown: input.facts, closedLately: [], source: '', language: parts.language, agents: task.agents };
    const gated = judge(LEDGER_GATES, checked.ops.map(operationOf), ground, clock.now);
    gated.refused.forEach((finding) => { parts.log(`${where}: reconcile refused — ${finding.gate} ${finding.reason}`); });
    if (gated.kept.length === 0) {
        return;
    }
    const applied = parts.stories.keep({ task: { tab: task.tab, key: task.key }, at: clock.now, language: parts.language }, { story: null, merges: [], reconciled: changes(gated.kept) });
    applied.refused.forEach((one) => { parts.log(`${where}: the ledger refused ${one.op.op} — ${one.reason}`); });
    parts.log(`${where}: reconciled ${applied.changed.length} facts`);
}

/** a task is reconciled at most this often (as it is curated) */
const GAP_MS = 5 * 60_000;

/** Turns between two reconciliations of a tab's ledger, until `TAB_RECAP_RECONCILE_EVERY` says otherwise. */
export const RECONCILE_EVERY = 8;

/** Why a tab is curated: its expanded view was opened, enough turns passed, or a lane's session was compacted. */
export type CurateWhy = 'open' | 'turns' | 'boundary';

/** A recap run that wrote to a tab's ledger: the prompts of the operator it read, and whether a lane was compacted in what it read. */
export interface RunEvent {
    readonly tab: string;
    readonly turns: number;
    readonly boundary: boolean;
    /** why the run was made: `turn-ended`, `focused`, `requested` (or `imported`) */
    readonly cause?: string;
}

/** What the curator is given, reconciling or telling the story. */
export interface ReconcilingDeps {
    readonly ledger: Ledger;
    readonly stories: Stories;
    /** the curator as the job is set now; null when it is off or no harness is there */
    readonly writer: () => Curators | null;
    readonly clock: () => number;
    readonly zone: () => string;
    /** the language the paragraph is written in */
    readonly language: () => string;
    /** the rubric's item checks the curator is shown */
    readonly rubric: string;
    /** the newest turns of these lanes (the evidence of a reconciliation); not given: the ledger is never reconciled */
    readonly tail?: (lanes: readonly LaneCursor[]) => Promise<readonly Entry[]>;
    /** the turns between two reconciliations (`RECONCILE_EVERY` when not given) */
    readonly every?: () => number;
    log(line: string): void;
}

/** When a tab's ledger is reconciled: every few turns, after a boundary, and at an open of the expanded view that follows new turns. */
export class Reconciling {
    private readonly deps: ReconcilingDeps;
    private readonly lastRun = new Map<string, number>();
    private readonly running = new Set<string>();
    /** the prompts read for each tab since its ledger was last reconciled */
    private readonly turns = new Map<string, number>();

    constructor(deps: ReconcilingDeps) {
        this.deps = deps;
    }

    /** Counts the run's turns; whether the tab is due: a boundary was crossed or enough turns have passed. */
    due(event: RunEvent): boolean {
        const turns = (this.turns.get(event.tab) ?? 0) + event.turns;
        this.turns.set(event.tab, turns);
        return event.boundary || turns >= (this.deps.every?.() ?? RECONCILE_EVERY);
    }

    /** The tab's tasks were reconciled: its turns are counted from here. */
    settle(tab: string): void {
        this.turns.set(tab, 0);
    }

    private wanted(key: string, why: CurateWhy, tab: string, now: number): boolean {
        const last = this.lastRun.get(key);
        const fresh = why !== 'open' || last === undefined || (this.turns.get(tab) ?? 0) > 0;
        return fresh && !this.running.has(key) && (last === undefined || now - last >= GAP_MS);
    }

    /** One call that checks the task's open facts against the newest turns of its lanes. */
    async task(tab: string, task: { readonly id: string; readonly name: string; readonly lanes: readonly string[] }, lanes: readonly LaneCursor[], why: CurateWhy): Promise<boolean> {
        const { deps } = this;
        const [key, now] = [`${tab}\u0000${task.id}`, deps.clock()];
        const writer = deps.writer();
        const facts = deps.ledger.allOf({ tab, key: task.id });
        if (deps.tail === undefined || writer === null || !facts.some((fact) => fact.state === 'open') || !this.wanted(key, why, tab, now)) {
            return false;
        }
        this.lastRun.set(key, now);
        this.running.add(key);
        try {
            const mine = lanes.filter((lane) => task.lanes.length === 0 || task.lanes.includes(lane.pane));
            const tail = await deps.tail(mine);
            const parts = { writer, stories: deps.stories, language: deps.language(), rubric: deps.rubric, clock: { now, zone: deps.zone() }, log: (line: string): void => { deps.log(line); } };
            await reconcileTask(parts, { tab, key: task.id, name: task.name, facts, tail, agents: mine.flatMap((lane) => [lane.agent, lane.title ?? '']).filter((name) => name !== '').map((name) => name.toLowerCase()) });
            return true;
        } finally {
            this.running.delete(key);
        }
    }
}
