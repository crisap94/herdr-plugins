import type { Curated, Curators } from '#src/ports/curators.ts';
import type { FactStore } from '#src/ports/ledger.ts';
import type { SessionCursor } from '#src/ports/recap-records.ts';
import type { Stories } from '#src/ports/stories.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import type { TaskShape } from '#src/recap/domain/grouping.ts';
import type { SessionKey } from '#src/recap/domain/followed-session-shape.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { LEDGER_GATES } from '#src/recap/domain/gates/ledger-gates.ts';
import type { CloseOp, Operation, UpdateOp } from '#src/recap/domain/ops.ts';
import { reconciliationOf } from '#src/recap/domain/reconciliation.ts';
import type { Reconciled, Reconciliation } from '#src/recap/domain/reconciliation.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';
import type { Result } from '#src/protocol/result.ts';
import { brand, type Brand } from '#src/recap/domain/brand.ts';
import type { Boundary } from '#src/contract/events.ts';
import type { Count } from '#src/contract/kernel.ts';
import type { ScopeId } from '#src/contract/ids.ts';
import { answerTextOf } from './recap-shape.ts';
import { reconcileInput } from './curator-input.ts';
import { batch } from './job-kit/batch.ts';
import { reconcileRepair } from './job-kit/repair.ts';
import type { RepairMode } from './job-kit/repair.ts';
import type { Judged, TaskGround } from './ops-gating.ts';

const textOf = brand<string, 'Text'>;
const count = brand<number, 'Count'>;

export type Due = Brand<boolean, 'Due'>;
type Wanted = Brand<boolean, 'Wanted'>;
export type Ran = Brand<boolean, 'Ran'>;

export interface ReconcileClock {
    readonly now: Instant;
    readonly zone: Text;
}

export interface CurateTarget {
    readonly id: Text;
    readonly name: Text;
    readonly lanes: readonly SessionKey[];
}

export interface ReconcileParts {
    readonly writer: Curators;
    readonly stories: Stories;
    readonly language: Text;
    readonly rubric: Text;
    readonly clock: ReconcileClock;
    readonly repair?: () => RepairMode;
    log(line: Text): void;
}

export interface ReconcileTask {
    readonly scope: ScopeId;
    readonly key: Text;
    readonly name: Text;
    readonly facts: readonly Fact[];
    readonly tail: readonly Entry[];
    readonly agents: readonly Text[];
}

const operationOf = (one: Reconciled): Operation => (one.op === 'close' ? { op: 'close', id: brand<string, 'FactId'>(one.id), why: one.why } : { op: 'update', id: brand<string, 'FactId'>(one.id), text: one.text, why: one.why });
const changes = (ops: readonly Operation[]): readonly (UpdateOp | CloseOp)[] => ops.flatMap((op) => (op.op === 'add' ? [] : [op]));

type Reading = (answer: Curated) => Reconciliation;

interface Round {
    readonly sent: Result<Text, ParseFailure>;
    readonly said: Result<Text, ParseFailure>;
    readonly reading: Reading;
    readonly ground: TaskGround;
    readonly checked: Reconciliation;
    readonly first: Judged;
}

async function repairedOf(parts: ReconcileParts, task: ReconcileTask, round: Round): Promise<Judged> {
    const refusals = round.checked.refused.length + round.first.refused.length;
    if (parts.repair?.() !== 'once' || refusals === 0 || round.sent.kind === 'err' || round.said.kind === 'err') {
        return round.first;
    }
    const { writer } = parts;
    const where = `curator ${task.scope} ${task.key}`;
    parts.log(textOf(`${where}: reconcile repair — ${refusals} refused`));
    const repair = await writer.write(reconcileRepair(round.sent.value, round.said.value, round.checked, round.first), 'reconcile');
    if (isUnknown(repair)) {
        parts.log(textOf(`${where}: ${writer.backend} gave no repair (${saying(repair.why)})`));
        return round.first;
    }
    const rechecked = round.reading(repair);
    if (rechecked.refused.some((why) => why === 'the answer is not JSON')) {
        parts.log(textOf(`${where}: reconcile repair refused — the answer is not JSON`));
        return round.first;
    }
    for (const why of rechecked.refused) {
        parts.log(textOf(`${where}: reconcile refused — ${why}`));
    }
    const judged = batch('reconcile', { gates: LEDGER_GATES, task: round.ground, at: parts.clock.now }, rechecked.ops.map(operationOf));
    for (const finding of judged.refused) {
        parts.log(textOf(`${where}: reconcile refused — ${finding.gate} ${finding.reason}`));
    }
    return judged;
}

export async function reconcileTask(parts: ReconcileParts, task: ReconcileTask): Promise<void> {
    const { writer, clock } = parts;
    const where = `curator ${task.scope} ${task.key}`;
    const open = task.facts.filter((fact) => fact.state === 'open');
    if (open.length === 0 || task.tail.length === 0) {
        return;
    }
    const input = reconcileInput({ name: task.name, language: parts.language, rubric: parts.rubric, open, tail: task.tail, clock });
    const answered = await writer.write(input.document, 'reconcile');
    if (isUnknown(answered)) {
        parts.log(textOf(`${where}: ${writer.backend} gave none to reconcile (${saying(answered.why)})`));
        return;
    }
    const reading: Reading = (answer) => {
        const text = answer.kind === 'curated' ? answer.text : '';
        const read = parseText(text);
        return reconciliationOf(read.kind === 'ok' ? answerTextOf(read.value) : textOf(text), input.facts, input.tail);
    };
    const checked = reading(answered);
    checked.refused.forEach((why) => { parts.log(textOf(`${where}: reconcile refused — ${why}`)); });
    const openFacts = [...input.facts.values()].filter((fact) => fact.state === 'open');
    const ground: TaskGround = { key: task.key, scope: textOf(task.scope), shown: input.facts, open: openFacts, closedLately: [], source: textOf(''), language: parts.language, agents: task.agents };
    const first = batch('reconcile', { gates: LEDGER_GATES, task: ground, at: clock.now }, checked.ops.map(operationOf));
    first.refused.forEach((finding) => { parts.log(textOf(`${where}: reconcile refused — ${finding.gate} ${finding.reason}`)); });
    const gated = await repairedOf(parts, task, { sent: parseText(input.document), said: parseText(answered.text), reading, ground, checked, first });
    if (gated.kept.length === 0) {
        return;
    }
    const applied = parts.stories.keep({ task: { scope: task.scope, key: task.key }, at: clock.now, language: parts.language }, { story: null, merges: [], reconciled: changes(gated.kept) });
    applied.refused.forEach((one) => { parts.log(textOf(`${where}: the ledger refused ${one.op.op} — ${one.reason}`)); });
    parts.log(textOf(`${where}: reconciled ${applied.changed.length} facts`));
}

const GAP_MS = 5 * 60_000;

export const RECONCILE_EVERY = count(8);

export type CurateWhy = 'open' | 'turns' | 'boundary';

export interface RunTurn {
    readonly key: SessionKey;
    readonly at: Instant;
}

export interface RunAccomplishment {
    readonly task: TaskShape;
    readonly fact: Fact;
    readonly at: Instant;
}

export interface RecapWritten {
    readonly scope: ScopeId;
    readonly turns: Count;
    readonly boundary: Boundary;
    readonly cause?: Text;
    readonly entries?: readonly RunTurn[];
    readonly established?: readonly RunAccomplishment[];
}

export interface ReconcilingDeps {
    readonly ledger: FactStore;
    readonly stories: Stories;
    readonly writer: () => Curators | null;
    readonly clock: () => Instant;
    readonly zone: () => Text;
    readonly language: () => Text;
    readonly rubric: Text;
    readonly tail?: (lanes: readonly SessionCursor[]) => Promise<readonly Entry[]>;
    readonly every?: () => Count;
    readonly repair?: () => RepairMode;
    log(line: Text): void;
}

export class Reconciling {
    private readonly deps: ReconcilingDeps;
    private readonly lastRun = new Map<Text, Instant>();
    private readonly running = new Set<Text>();
    private readonly turns = new Map<ScopeId, Count>();

    constructor(deps: ReconcilingDeps) {
        this.deps = deps;
    }

    due(event: RecapWritten): Due {
        const turns = count((this.turns.get(event.scope) ?? 0) + event.turns);
        this.turns.set(event.scope, turns);
        return brand<boolean, 'Due'>(event.boundary || turns >= (this.deps.every?.() ?? RECONCILE_EVERY));
    }

    settle(scope: ScopeId): void {
        this.turns.set(scope, count(0));
    }

    private wanted(key: Text, why: CurateWhy, scope: ScopeId, now: Instant): Wanted {
        const last = this.lastRun.get(key);
        const fresh = why !== 'open' || last === undefined || (this.turns.get(scope) ?? 0) > 0;
        return brand<boolean, 'Wanted'>(fresh && !this.running.has(key) && (last === undefined || now - last >= GAP_MS));
    }

    async task(scope: ScopeId, task: CurateTarget, lanes: readonly SessionCursor[], why: CurateWhy): Promise<Ran> {
        const { deps } = this;
        const [key, now] = [textOf(`${scope}\u0000${task.id}`), deps.clock()];
        const writer = deps.writer();
        const facts = deps.ledger.allOf({ scope, key: task.id });
        if (deps.tail === undefined || writer === null || !facts.some((fact) => fact.state === 'open') || !this.wanted(key, why, scope, now)) {
            return brand<boolean, 'Ran'>(false);
        }
        this.lastRun.set(key, now);
        this.running.add(key);
        try {
            const mine = lanes.filter((seat) => task.lanes.length === 0 || task.lanes.some((member) => member === seat.key));
            const tail = await deps.tail(mine);
            const parts = { writer, stories: deps.stories, language: deps.language(), rubric: deps.rubric, clock: { now, zone: deps.zone() }, ...(deps.repair === undefined ? {} : { repair: deps.repair }), log: (line: Text): void => { deps.log(line); } };
            await reconcileTask(parts, { scope, key: task.id, name: task.name, facts, tail, agents: mine.flatMap((lane) => [lane.agent, lane.title ?? '']).filter((name) => name !== '').map((name) => textOf(name.toLowerCase())) });
            return brand<boolean, 'Ran'>(true);
        } finally {
            this.running.delete(key);
        }
    }
}
