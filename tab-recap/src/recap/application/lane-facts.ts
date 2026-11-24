import { must } from '@stateforge-labs/session-ledger';
import { knownOr, type GuardedLedger, type GuardedRecapRecords } from '#src/ports/guarded-reads.ts';
import type { ContextUse } from '@stateforge-labs/session-ledger';
import { shareOf } from '@stateforge-labs/session-ledger';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { LaneTokenFacts } from '#src/recap/domain/lane-tokens.ts';
import { type SessionKey, parseTabId } from '#src/recap/domain/ids.ts';
import { tabIdOf } from '@stateforge-labs/session-ledger';
import { countOf } from '@stateforge-labs/session-ledger';

interface ContextsOf {
    of(pane: SessionKey): ContextUse | null;
}

export interface FactsDeps {
    readonly contexts: ContextsOf;
    readonly records: Pick<GuardedRecapRecords, 'readRecap'>;
    readonly ledger: Pick<GuardedLedger, 'openOf'>;
}

export function factsOf(lane: Lane, deps: FactsDeps): LaneTokenFacts {
    const tab = String(lane.tab);
    const use = deps.contexts.of(lane.pane);
    const recap = knownOr(deps.records.readRecap(must(parseTabId(tab))), null);
    const needs = (recap?.tasks ?? []).reduce((count, task) => count + knownOr(deps.ledger.openOf({ scope: tabIdOf(tab), key: task.id }), []).filter((fact) => fact.section === 'needs').length, 0);
    return { share: use === null ? null : countOf(shareOf(use)), recapAt: recap?.at ?? null, needs: countOf(needs) };
}
