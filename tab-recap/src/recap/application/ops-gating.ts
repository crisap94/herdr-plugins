// An answer's operations, per task: the gates, then a dry run of the fold against the facts the document showed, so everything that
// would be refused is known (and can be sent back once) before anything is written.
import type { Fact, FactId, RunId } from '#src/recap/domain/fact.ts';
import { gatekeeper, correctionOf } from '#src/recap/domain/gates/gatekeeper.ts';
import type { GateStats, Gated } from '#src/recap/domain/gates/gatekeeper.ts';
import type { Finding, Gate } from '#src/recap/domain/gates/gate.ts';
import { apply } from '#src/recap/domain/ops.ts';
import type { Operation } from '#src/recap/domain/ops.ts';
import type { Tasked } from './ops-answer.ts';

/** What a task's operations are judged against. */
export interface TaskGround {
    readonly key: string;
    readonly tab: string;
    /** document id → fact, as the document showed them */
    readonly shown: ReadonlyMap<string, Fact>;
    readonly closedLately: readonly Fact[];
    /** the language the recap is written in, and the labels, kinds and ids of the tab's agents (lower-cased): what the item gates read */
    readonly language: string;
    readonly agents: readonly string[];
}

export interface Judged {
    /** the operations that passed, with fact ids in place of document ids */
    readonly kept: readonly Operation[];
    readonly refused: readonly Finding[];
    /** every operation of the task as the writer gave it (what `refused` points into) */
    readonly given: readonly Operation[];
    readonly gated: Gated;
}

const asFact = (op: Operation, shown: ReadonlyMap<string, Fact>): Operation => (op.op === 'add' ? op : { ...op, id: shown.get(op.id)?.id ?? op.id });

const DRY = { id: 'dry-run' as RunId, language: 'en' };

/** Gates, then the fold on the shown facts: the fold's refusals are findings too (gate `L`). */
export function judge(gates: readonly Gate[], ops: readonly Operation[], ground: TaskGround, now: number): Judged {
    const gated = gatekeeper(gates, ops, { now, shown: ground.shown, closedLately: ground.closedLately, language: ground.language, agents: ground.agents });
    const resolved = gated.kept.map((op) => asFact(op, ground.shown));
    let made = 0;
    const folded = apply([...ground.shown.values()], resolved, { ...DRY, task: { tab: ground.tab, key: ground.key }, at: now, mint: () => `dry-${(made += 1)}` as FactId });
    const late: Finding[] = folded.refused.map((refusal) => ({
        at: ops.indexOf(gated.kept[resolved.indexOf(refusal.op)] as Operation), gate: 'L', outcome: 'refuse', reason: `refused by the ledger: ${refusal.reason}`,
    }));
    const dropped = new Set(late.map((finding) => finding.at));
    const kept = gated.kept.flatMap((op, at) => (dropped.has(ops.indexOf(op)) ? [] : [resolved[at] as Operation]));
    return { kept, refused: [...gated.refused, ...late], given: ops, gated };
}

/** The operations of `tasked` that are for `key`. */
export const forTask = (tasked: readonly Tasked[], key: string): readonly Operation[] => tasked.filter((each) => each.task === key).map((each) => each.op);

/** The correction text for a retry: every refused operation, and every malformed one. */
export function correctionFor(judged: readonly Judged[], problems: readonly string[]): string {
    return [...judged.map((each) => correctionOf(each.given, each.refused)).filter((line) => line !== ''), ...problems.map((problem) => `shape: ${problem}`)].join('\n');
}

export const refusedIn = (judged: readonly Judged[]): number => judged.reduce((all, each) => all + each.refused.length, 0);

export type { GateStats };
