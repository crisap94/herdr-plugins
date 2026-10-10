import type { ContextUse } from '#src/recap/domain/compaction.ts';
import { shareOf } from '#src/recap/domain/compaction.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { LaneFacts } from '#src/recap/domain/lane-tokens.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import type { RecapRecords } from '#src/ports/recap-records.ts';

export interface FactsDeps {
    readonly contexts: { of(pane: string): ContextUse | null };
    readonly records: Pick<RecapRecords, 'readRecap'>;
    readonly ledger: Pick<Ledger, 'openOf'>;
}

export function factsOf(lane: Lane, deps: FactsDeps): LaneFacts {
    const tab = String(lane.tab);
    const use = deps.contexts.of(String(lane.pane));
    const recap = deps.records.readRecap(tab);
    const needs = (recap?.tasks ?? []).reduce((count, task) => count + deps.ledger.openOf({ tab, key: task.id }).filter((fact) => fact.section === 'needs').length, 0);
    return { share: use === null ? null : shareOf(use), recapAt: recap?.at ?? null, needs };
}
