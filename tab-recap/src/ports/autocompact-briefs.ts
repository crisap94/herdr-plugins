import type { CheckedFact } from '@stateforge-labs/session-ledger';
import type { Count } from '@stateforge-labs/session-ledger';
import type { FactIndex } from '#src/recap/domain/fact-index.ts';
import type { DecisionId } from '#src/recap/domain/ids.ts';
import type { Text } from '@stateforge-labs/session-ledger';
import type { Instant } from '@stateforge-labs/session-ledger';

export interface DecisionBriefs {
    put(decisionId: DecisionId, brief: Text, appended: readonly FactIndex[], checked: readonly CheckedFact[], briefedAt: Instant): void;
    clearBefore(cutoff: Instant): Count;
}
