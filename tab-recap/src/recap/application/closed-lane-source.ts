import type { ClosedLaneIdentity } from '#src/recap/domain/closures.ts';
import type { Fact, TaskId } from '#src/recap/domain/fact.ts';
import { inWindow } from '#src/recap/domain/retention.ts';
import type { ClosedLaneDays } from '#src/recap/domain/retention.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { ClosureReader } from '#src/ports/closed-lanes.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { CLOSED_SHOWN_MS } from './ledger-input.ts';

export type ClosedUnknownReason = 'store-unreadable' | 'ledger-unreadable';

export type ClosedLaneResolution =
    | { readonly kind: 'found'; readonly task: TaskId; readonly facts: readonly Fact[] }
    | { readonly kind: 'expired'; readonly closedAt: Instant }
    | { readonly kind: 'never-seen' }
    | { readonly kind: 'unknown'; readonly reason: ClosedUnknownReason };

export interface ClosedSourceDeps {
    readonly closures: Pick<ClosureReader, 'resolve'>;
    readonly ledger: Pick<Ledger, 'allOf'>;
    readonly closedDays: ClosedLaneDays;
    readonly now: Instant;
}

const openAt = (fact: Fact, closedAt: Instant): boolean =>
    fact.firstAt <= closedAt && (fact.closedAt === null || fact.closedAt > closedAt);

const closedWithin = (fact: Fact, closedAt: Instant): boolean =>
    fact.closedAt !== null && fact.closedAt <= closedAt && fact.closedAt >= closedAt - CLOSED_SHOWN_MS;

export function factsAsOf(facts: readonly Fact[], closedAt: Instant): readonly Fact[] {
    return [...facts.filter((fact) => openAt(fact, closedAt)), ...facts.filter((fact) => closedWithin(fact, closedAt))];
}

export function resolveClosedLane(identity: ClosedLaneIdentity, deps: ClosedSourceDeps): ClosedLaneResolution {
    const read = deps.closures.resolve(identity);
    if (isUnknown(read)) {
        return { kind: 'unknown', reason: 'store-unreadable' };
    }
    if (read.kind === 'absent') {
        return { kind: 'never-seen' };
    }
    const { record } = read;
    if (deps.closedDays === 0) {
        return { kind: 'never-seen' };
    }
    if (!inWindow(record.closedAt, deps.now, deps.closedDays)) {
        return { kind: 'expired', closedAt: record.closedAt };
    }
    if (record.association === null) {
        return { kind: 'never-seen' };
    }
    try {
        const facts = factsAsOf(deps.ledger.allOf(record.association.task), record.closedAt);
        return { kind: 'found', task: record.association.task, facts };
    } catch {
        return { kind: 'unknown', reason: 'ledger-unreadable' };
    }
}
