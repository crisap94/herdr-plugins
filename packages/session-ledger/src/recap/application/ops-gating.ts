import type { InputFact } from '#src/ports/recap-input.ts';
import type { Correction, RefusedOperation } from '#src/ports/summarizer.ts';
import { brand, type Brand } from '#src/recap/domain/brand.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { Count } from '#src/contract/kernel.ts';
import { gatekeeper } from '#src/recap/domain/gates/gatekeeper.ts';
import type { GateStats, Gated } from '#src/recap/domain/gates/gatekeeper.ts';
import type { Finding, Gate } from '#src/recap/domain/gates/gate.ts';
import { apply } from '#src/recap/domain/ops.ts';
import type { Operation } from '#src/recap/domain/ops.ts';
import type { Tasked } from './ops-answer.ts';
import { scopeIdOf } from '#src/recap/domain/followed-session-shape.ts';

const textOf = brand<string, 'Text'>;
const count = brand<number, 'Count'>;

type Order = Brand<number, 'Order'>;
type Grouped = readonly [Count, readonly Reasoned[]];

export interface TaskGround {
    readonly key: Text;
    readonly tab: Text;
    readonly shown: ReadonlyMap<Text, Fact>;
    readonly open: readonly Fact[];
    readonly closedLately: readonly Fact[];
    readonly source: Text;
    readonly language: Text;
    readonly agents: readonly Text[];
}

export interface RetryWorld {
    readonly tasks: readonly TaskGround[];
    readonly facts: ReadonlyMap<Text, InputFact>;
}

interface Reasoned {
    readonly gate: Text;
    readonly reason: Text;
}

export interface Judged {
    readonly kept: readonly Operation[];
    readonly refused: readonly Finding[];
    readonly given: readonly Operation[];
    readonly gated: Gated;
}

const asFact = (op: Operation, shown: ReadonlyMap<Text, Fact>): Operation => (op.op === 'add' ? op : { ...op, id: shown.get(textOf(op.id))?.id ?? op.id });

const DRY = { id: brand<string, 'RunId'>('dry-run'), language: textOf('en') };

export function judge(gates: readonly Gate[], ops: readonly Operation[], ground: TaskGround, now: Instant): Judged {
    const gated = gatekeeper(gates, ops, { now, shown: ground.shown, open: ground.open, closedLately: ground.closedLately, source: ground.source, language: ground.language, agents: ground.agents });
    const resolved = gated.kept.map((op) => asFact(op, ground.shown));
    let made = 0;
    const folded = apply([...ground.shown.values()], resolved, { ...DRY, task: { scope: scopeIdOf(ground.tab), key: ground.key }, at: now, mint: () => brand<string, 'FactId'>(`dry-${(made += 1)}`) });
    const late: Finding[] = folded.refused.map((refusal) => {
        const source = gated.kept[resolved.indexOf(refusal.op)];
        return { at: count(source === undefined ? -1 : ops.indexOf(source)), gate: 'L', outcome: 'refuse', reason: textOf(`refused by the ledger: ${refusal.reason}`) };
    });
    const dropped = new Set(late.map((finding) => finding.at));
    const kept = resolved.filter((_, at) => {
        const source = gated.kept[at];
        return !dropped.has(count(source === undefined ? -1 : ops.indexOf(source)));
    });
    return { kept, refused: [...gated.refused, ...late], given: ops, gated };
}

export const forTask = (tasked: readonly Tasked[], key: Text): readonly Operation[] => tasked.filter((each) => each.task === key).map((each) => each.op);

export function keptOf(judged: readonly Judged[], tasks: readonly TaskGround[]): readonly Tasked[] {
    return judged.flatMap((each, at) => {
        const out = new Set(each.refused.map((finding) => finding.at));
        return each.given.flatMap((op, index) => (out.has(count(index)) ? [] : [{ task: tasks[at]?.key ?? textOf(''), op }]));
    });
}

const byNumber = (a: InputFact, b: InputFact): Order => brand<number, 'Order'>(Number(a.id.slice(1)) - Number(b.id.slice(1)));

const earlier = ([a]: Grouped, [b]: Grouped): Order => brand<number, 'Order'>(a - b);

function namedFacts(refused: readonly RefusedOperation[], facts: ReadonlyMap<Text, InputFact>): readonly InputFact[] {
    const ids = new Set(refused.flatMap((one) => [...(one.operation.op === 'add' ? [] : [one.operation.id]), ...one.reasons.flatMap((each) => each.reason.match(/\bf\d+\b/gu) ?? [])]));
    return [...ids].flatMap((id) => facts.get(textOf(id)) ?? []).toSorted(byNumber);
}

export function retryFor(judged: readonly Judged[], world: RetryWorld, problems: readonly Text[]): Correction {
    const refused = judged.flatMap((each, task): RefusedOperation[] => {
        const reasons = new Map<Count, Reasoned[]>();
        for (const finding of each.refused) {
            const at = finding.at;
            reasons.set(at, [...(reasons.get(at) ?? []), { gate: textOf(finding.gate), reason: finding.reason }]);
        }
        return [...reasons].toSorted(earlier).flatMap(([at, why]) => {
            const operation = each.given[at];
            return operation === undefined ? [] : [{ task: world.tasks[task]?.key ?? textOf(''), operation, reasons: why }];
        });
    });
    return { refused, problems, facts: namedFacts(refused, world.facts), tasks: brand<boolean, 'Several'>(world.tasks.length > 1) };
}

export const refusedIn = (judged: readonly Judged[]): Count => count(judged.reduce((all, each) => all + each.refused.length, 0));

export type { GateStats };
