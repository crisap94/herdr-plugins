import type { HandoffAnswerRow, HandoffAnswers, HandoffVerdict } from '#src/ports/handoff-answers.ts';
import type { HandoffId } from '#src/recap/domain/ids.ts';

export class MemoryHandoffAnswers implements HandoffAnswers {
    private readonly storable: (reason: string) => boolean;
    private readonly now: () => number;
    private readonly rows = new Map<HandoffId, HandoffAnswerRow>();

    constructor(storable: (reason: string) => boolean, now: () => number) {
        this.storable = storable;
        this.now = now;
    }

    answerHandoff(id: HandoffId, verdict: HandoffVerdict): void {
        if (verdict.reason !== null && !this.storable(verdict.reason)) {
            throw new Error(`handoff reason ${verdict.reason} is not storable`);
        }
        if (this.rows.has(id)) {
            throw new Error('a handoff has one answer');
        }
        this.rows.set(id, { ...verdict, id, at: this.now() });
    }

    handoffAnswer(id: HandoffId): HandoffAnswerRow | null {
        return this.rows.get(id) ?? null;
    }

    prune(before: number): void {
        for (const [id, row] of this.rows) {
            if (row.at < before) {
                this.rows.delete(id);
            }
        }
    }
}
