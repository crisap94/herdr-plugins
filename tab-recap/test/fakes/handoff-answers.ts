import type { HandoffAnswerRow, HandoffAnswers, HandoffVerdict } from '#src/ports/handoff-answers.ts';
import type { HandoffId } from '#src/recap/domain/ids.ts';
import type { StorablePair } from '#src/adapters/db/handoff-answers.ts';

export class MemoryHandoffAnswers implements HandoffAnswers {
    private readonly storable: StorablePair;
    private readonly now: () => number;
    private readonly rows = new Map<HandoffId, HandoffAnswerRow>();

    constructor(storable: StorablePair, now: () => number) {
        this.storable = storable;
        this.now = now;
    }

    answerHandoff(id: HandoffId, verdict: HandoffVerdict): void {
        if (!this.storable(verdict.outcome, verdict.reason)) {
            throw new Error(`handoff ${verdict.outcome} ${verdict.reason ?? 'delivered'} is not storable`);
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
