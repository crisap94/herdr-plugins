import type { CheckedFact } from '#src/recap/domain/autocompact.ts';
import type { Count } from '#src/recap/domain/count.ts';
import type { FactIndex } from '#src/recap/domain/fact-index.ts';
import type { DecisionId } from '#src/recap/domain/ids.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';

export interface DecisionBriefs {
    put(decisionId: DecisionId, brief: Text, appended: readonly FactIndex[], checked: readonly CheckedFact[], briefedAt: Instant): void;
    clearBefore(cutoff: Instant): Count;
}
