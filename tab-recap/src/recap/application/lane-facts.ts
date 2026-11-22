import { knownOr, type GuardedLedger, type GuardedRecapRecords } from '#src/ports/guarded-reads.ts';
import type { ContextUse } from '#src/recap/domain/compaction.ts';
import { shareOf } from '#src/recap/domain/compaction.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { LaneFacts } from '#src/recap/domain/lane-tokens.ts';
import { tabId } from '#src/recap/domain/ids.ts';

interface ContextsOf {
    of(pane: string): ContextUse | null;
}

export interface FactsDeps {
    readonly contexts: ContextsOf;
    readonly records: Pick<GuardedRecapRecords, 'readRecap'>;
    readonly ledger: Pick<GuardedLedger, 'openOf'>;
}

export function factsOf(lane: Lane, deps: FactsDeps): LaneFacts {
    const tab = String(lane.tab);
    const use = deps.contexts.of(String(lane.pane));
    const recap = knownOr(deps.records.readRecap(tabId(tab)), null);
    const needs = (recap?.tasks ?? []).reduce((count, task) => count + knownOr(deps.ledger.openOf({ tab, key: task.id }), []).filter((fact) => fact.section === 'needs').length, 0);
    return { share: use === null ? null : shareOf(use), recapAt: recap?.at ?? null, needs };
}
