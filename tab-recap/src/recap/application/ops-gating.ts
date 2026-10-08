// An answer's operations, per task: the gates, then a dry run of the fold against the facts the document showed, so everything that
// would be refused is known (and can be sent back once) before anything is written.
import type { InputFact } from '#src/ports/recap-input.ts';
import type { Correction, RefusedOperation } from '#src/ports/summarizer.ts';
import type { Fact, FactId, RunId } from '#src/recap/domain/fact.ts';
import { gatekeeper } from '#src/recap/domain/gates/gatekeeper.ts';
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
    /** the input's turns, tool calls and notes with the words folded: what G11 looks an anchor up in */
    readonly source: string;
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
    const gated = gatekeeper(gates, ops, { now, shown: ground.shown, closedLately: ground.closedLately, source: ground.source, language: ground.language, agents: ground.agents });
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

/** The operations of one task that passed, as the writer gave them (document ids): what the retry keeps. */
export function keptOf(judged: readonly Judged[], tasks: readonly TaskGround[]): readonly Tasked[] {
    return judged.flatMap((each, at) => {
        const out = new Set(each.refused.map((finding) => finding.at));
        return each.given.flatMap((op, index) => (out.has(index) ? [] : [{ task: tasks[at]?.key ?? '', op }]));
    });
}

/** The facts a refusal speaks of: the ones its operation names and the ones its reasons name (`it repeats f4`), in document order. */
function namedFacts(refused: readonly RefusedOperation[], facts: ReadonlyMap<string, InputFact>): readonly InputFact[] {
    const ids = new Set(refused.flatMap((one) => [...(one.operation.op === 'add' ? [] : [one.operation.id]), ...one.reasons.flatMap((each) => each.reason.match(/\bf\d+\b/gu) ?? [])]));
    return [...ids].flatMap((id) => facts.get(id) ?? []).toSorted((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
}

/** The short document of the retry: every refused operation with its reasons, the facts it names, and the answer's malformed operations. */
export function retryFor(judged: readonly Judged[], world: { readonly tasks: readonly TaskGround[]; readonly facts: ReadonlyMap<string, InputFact> }, problems: readonly string[]): Correction {
    const refused = judged.flatMap((each, task): RefusedOperation[] => {
        const reasons = new Map<number, { gate: string; reason: string }[]>();
        for (const finding of each.refused) {
            reasons.set(finding.at, [...(reasons.get(finding.at) ?? []), { gate: finding.gate, reason: finding.reason }]);
        }
        return [...reasons].toSorted(([a], [b]) => a - b).flatMap(([at, why]) => {
            const operation = each.given[at];
            return operation === undefined ? [] : [{ task: world.tasks[task]?.key ?? '', operation, reasons: why }];
        });
    });
    return { refused, problems, facts: namedFacts(refused, world.facts), tasks: world.tasks.length > 1 };
}

export const refusedIn = (judged: readonly Judged[]): number => judged.reduce((all, each) => all + each.refused.length, 0);

export type { GateStats };
