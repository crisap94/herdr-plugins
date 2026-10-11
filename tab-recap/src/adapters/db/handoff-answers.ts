import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { HandoffAnswerRow, HandoffAnswers } from '#src/ports/handoff-answers.ts';
import { storedOutcomeOf, type StoredHandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { HandoffId } from '#src/recap/domain/ids.ts';
import { writeTx } from './connection.ts';
import { handoffBytesOf } from './handoff-ids.ts';
import { guarded, maybeText, one, text, whole } from './rows.ts';
import type { Row } from './rows.ts';

export class HandoffAnswersRepository implements HandoffAnswers {
    private readonly db: DatabaseSync;
    private readonly now: () => number;
    private readonly insert: StatementSync;
    private readonly read: StatementSync;
    private readonly drop: StatementSync;

    constructor(db: DatabaseSync, now: () => number = Date.now) {
        this.db = db;
        this.now = now;
        this.insert = db.prepare('INSERT INTO handoff_answer (id, at, outcome, reason) VALUES (?, ?, ?, ?)');
        this.read = db.prepare('SELECT at, outcome, reason FROM handoff_answer WHERE id = ?');
        this.drop = db.prepare('DELETE FROM handoff_answer WHERE at < ?');
    }

    answerHandoff(id: HandoffId, outcome: StoredHandoffOutcome): void {
        const key = handoffBytesOf(id);
        if (key === null) {
            throw new RangeError('not a handoff id');
        }
        const reason = 'reason' in outcome ? outcome.reason : null;
        writeTx(this.db, () => {
            if (one(this.read, key) === null) {
                this.insert.run(key, this.now(), outcome.kind, reason);
            }
        });
    }

    handoffAnswer(id: HandoffId): HandoffAnswerRow | null {
        const key = handoffBytesOf(id);
        return guarded(() => {
            const row = key === null ? null : one(this.read, key);
            const stored = row === null ? null : storedOutcomeOf(text(row, 'outcome'), maybeText(row, 'reason'));
            return row === null || stored === null ? null : { kind: stored.kind, reason: 'reason' in stored ? stored.reason : null, id, at: whole(row, 'at') };
        }, null);
    }

    prune(before: number): void {
        writeTx(this.db, () => { this.drop.run(before); });
    }
}
