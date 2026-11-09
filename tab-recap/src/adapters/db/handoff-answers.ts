import type { Database } from 'bun:sqlite';
import { eq, lt } from 'drizzle-orm';
import type { HandoffAnswerRow, HandoffAnswers } from '#src/ports/handoff-answers.ts';
import { storedOutcomeOf, type StoredHandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { HandoffId } from '#src/recap/domain/ids.ts';
import { handoffAnswer } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { writeTx } from './connection.ts';
import { handoffBytesOf } from './handoff-ids.ts';
import { guarded, maybeText, text, whole } from './rows.ts';

export class HandoffAnswersRepository implements HandoffAnswers {
    private readonly db: Database;
    private readonly orm: Orm;
    private readonly now: () => number;

    constructor(db: Database, now: () => number = Date.now) {
        this.db = db;
        this.orm = ormOf(db);
        this.now = now;
    }

    answerHandoff(id: HandoffId, outcome: StoredHandoffOutcome): void {
        const key = handoffBytesOf(id);
        if (key === null) {
            throw new RangeError('not a handoff id');
        }
        const reason = 'reason' in outcome ? outcome.reason : null;
        writeTx(this.db, () => {
            const known = this.orm.select({ at: handoffAnswer.at }).from(handoffAnswer).where(eq(handoffAnswer.id, key)).get() ?? null;
            if (known === null) {
                this.orm.insert(handoffAnswer).values({ id: key, at: this.now(), outcome: outcome.kind, reason }).run();
            }
        });
    }

    handoffAnswer(id: HandoffId): HandoffAnswerRow | null {
        const key = handoffBytesOf(id);
        return guarded(() => {
            const row = key === null ? null : this.orm.select({ at: handoffAnswer.at, outcome: handoffAnswer.outcome, reason: handoffAnswer.reason }).from(handoffAnswer).where(eq(handoffAnswer.id, key)).get() ?? null;
            const stored = row === null ? null : storedOutcomeOf(text(row, 'outcome'), maybeText(row, 'reason'));
            return row === null || stored === null ? null : { kind: stored.kind, reason: 'reason' in stored ? stored.reason : null, id, at: whole(row, 'at') };
        }, null);
    }

    prune(before: number): void {
        writeTx(this.db, () => { this.orm.delete(handoffAnswer).where(lt(handoffAnswer.at, before)).run(); });
    }
}
