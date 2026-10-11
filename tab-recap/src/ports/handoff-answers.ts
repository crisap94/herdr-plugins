import type { StoredHandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { HandoffId } from '#src/recap/domain/ids.ts';

export interface HandoffAnswerRow {
    readonly kind: StoredHandoffOutcome['kind'];
    readonly reason: string | null;
    readonly id: HandoffId;
    readonly at: number;
}

export interface HandoffAnswers {
    answerHandoff(id: HandoffId, outcome: StoredHandoffOutcome): void;
    handoffAnswer(id: HandoffId): HandoffAnswerRow | null;
    prune(before: number): void;
}
