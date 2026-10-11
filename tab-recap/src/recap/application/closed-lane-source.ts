import type { ClosedLaneIdentity } from '#src/recap/domain/closures.ts';
import type { Fact, TaskId } from '#src/recap/domain/fact.ts';
import { inWindow } from '#src/recap/domain/retention.ts';
import type { ClosedLaneDays } from '#src/recap/domain/retention.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { ClosureReader, ClosureRuns } from '#src/ports/closed-lanes.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import { isUnknown, unreadableOf } from '#src/ports/unknowable.ts';
import type { Unknown } from '#src/ports/unknowable.ts';
import type { HandoffLane } from './handoff-render.ts';
import type { ClosedView } from './closed-view.ts';
import { CLOSED_SHOWN_MS } from './ledger-input.ts';

export type ClosedLaneResolution =
    | { readonly kind: 'found'; readonly task: TaskId; readonly facts: readonly Fact[]; readonly view: ClosedView }
    | { readonly kind: 'expired'; readonly closedAt: Instant }
    | { readonly kind: 'never-seen' }
    | Unknown;

export interface ClosedSourceDeps {
    readonly closures: Pick<ClosureReader, 'resolve'>;
    readonly ledger: Pick<Ledger, 'allOf'>;
    readonly runs: Pick<ClosureRuns, 'runAt'>;
    readonly closedDays: ClosedLaneDays;
    readonly now: Instant;
}

type Standing = 'present' | 'absent';

type Recency = 'within' | 'outside';

const openAt = (fact: Fact, closedAt: Instant): Standing =>
    fact.firstAt <= closedAt && (fact.closedAt === null || fact.closedAt > closedAt) ? 'present' : 'absent';

const asOpen = (fact: Fact): Fact => (fact.state === 'open' ? fact : { ...fact, state: 'open', closedAt: null, closedWhy: null });

const closedWithin = (fact: Fact, closedAt: Instant): Recency =>
    fact.closedAt !== null && fact.closedAt <= closedAt && fact.closedAt >= closedAt - CLOSED_SHOWN_MS ? 'within' : 'outside';

export function factsAsOf(facts: readonly Fact[], closedAt: Instant): readonly Fact[] {
    return [...facts.filter((fact) => openAt(fact, closedAt) === 'present').map(asOpen), ...facts.filter((fact) => closedWithin(fact, closedAt) === 'within')];
}

export function resolveClosedLane(identity: ClosedLaneIdentity, deps: ClosedSourceDeps): ClosedLaneResolution {
    const read = deps.closures.resolve(identity);
    if (isUnknown(read)) {
        return read;
    }
    if (read.kind === 'absent') {
        return { kind: 'never-seen' };
    }
    const { record } = read;
    if (deps.closedDays === 0) {
        return { kind: 'never-seen' };
    }
    if (inWindow(record.closedAt, deps.now, deps.closedDays) === 'outside') {
        return { kind: 'expired', closedAt: record.closedAt };
    }
    if (record.association === null) {
        return { kind: 'never-seen' };
    }
    try {
        const task = record.association.task;
        const facts = factsAsOf(deps.ledger.allOf(task), record.closedAt);
        const view = { closedAt: record.closedAt, agent: record.agent, cwd: record.cwd, run: deps.runs.runAt(task, record.closedAt) };
        return { kind: 'found', task, facts, view };
    } catch (error) {
        return unreadableOf(error);
    }
}

export function closedLaneOf(identity: ClosedLaneIdentity, view: ClosedView): HandoffLane {
    return { tab: identity.tab, pane: identity.pane, agent: view.agent, status: 'unknown', cwd: view.cwd };
}
