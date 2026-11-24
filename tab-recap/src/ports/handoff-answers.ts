import type { StoredHandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { HandoffId } from '#src/recap/domain/ids.ts';
import type { Text } from '@stateforge-labs/session-ledger';
import type { Instant } from '@stateforge-labs/session-ledger';

export interface HandoffAnswerRecord {
    readonly kind: StoredHandoffOutcome['kind'];
    readonly reason: Text | null;
    readonly id: HandoffId;
    readonly at: Instant;
}

export interface HandoffAnswerStore {
    answerHandoff(id: HandoffId, outcome: StoredHandoffOutcome): void;
    handoffAnswer(id: HandoffId): HandoffAnswerRecord | null;
    prune(before: Instant): void;
}
