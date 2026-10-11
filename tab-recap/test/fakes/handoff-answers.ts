import type { HandoffAnswerRow, HandoffAnswers } from '#src/ports/handoff-answers.ts';
import type { StoredHandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { HandoffId } from '#src/recap/domain/ids.ts';

export class MemoryHandoffAnswers implements HandoffAnswers {
    private readonly now: () => number;
    private readonly rows = new Map<HandoffId, HandoffAnswerRow>();

    constructor(now: () => number) {
        this.now = now;
    }

    answerHandoff(id: HandoffId, outcome: StoredHandoffOutcome): void {
        if (!this.rows.has(id)) {
            this.rows.set(id, { kind: outcome.kind, reason: 'reason' in outcome ? outcome.reason : null, id, at: this.now() });
        }
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
