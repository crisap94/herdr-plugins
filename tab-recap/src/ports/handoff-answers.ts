import type { HandoffId } from '#src/recap/domain/ids.ts';

export type HandoffVerdict =
    | { readonly outcome: 'delivered'; readonly reason: null }
    | { readonly outcome: 'refused' | 'unsupported' | 'failed'; readonly reason: string };

export type HandoffAnswerRow = HandoffVerdict & { readonly id: HandoffId; readonly at: number };

export interface HandoffAnswers {
    answerHandoff(id: HandoffId, verdict: HandoffVerdict): void;
    handoffAnswer(id: HandoffId): HandoffAnswerRow | null;
    prune(before: number): void;
}
