import type { HandoffAnswerRecord, HandoffAnswerStore } from '#src/ports/handoff-answers.ts';
import type { StoredHandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { HandoffId } from '#src/recap/domain/ids.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { must } from '#src/protocol/result.ts';

export class MemoryHandoffAnswers implements HandoffAnswerStore {
    private readonly now: () => number;
    private readonly rows = new Map<HandoffId, HandoffAnswerRecord>();

    constructor(now: () => number) {
        this.now = now;
    }

    answerHandoff(id: HandoffId, outcome: StoredHandoffOutcome): void {
        if (!this.rows.has(id)) {
            this.rows.set(id, { kind: outcome.kind, reason: 'reason' in outcome ? must(parseText(outcome.reason)) : null, id, at: instant(this.now()) });
        }
    }

    handoffAnswer(id: HandoffId): HandoffAnswerRecord | null {
        return this.rows.get(id) ?? null;
    }

    prune(before: Instant): void {
        for (const [id, row] of this.rows) {
            if (row.at < before) {
                this.rows.delete(id);
            }
        }
    }
}
