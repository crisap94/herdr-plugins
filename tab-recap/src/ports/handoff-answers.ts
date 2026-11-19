import type { StoredHandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { HandoffId } from '#src/recap/domain/ids.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';

export type { HandoffAnswerRow, HandoffAnswers } from './twins/runs/legacy.ts';

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
