import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { HandoffAnswerRow, HandoffAnswers, HandoffVerdict } from '#src/ports/handoff-answers.ts';
import type { HandoffId } from '#src/recap/domain/ids.ts';
import { writeTx } from './connection.ts';
import { handoffBytesOf } from './handoff-ids.ts';
import { guarded, maybeText, one, text, whole } from './rows.ts';
import type { Row } from './rows.ts';

export class UnstorableHandoffReason extends Error {}

export type StorablePair = (outcome: string, reason: string | null) => boolean;

function verdictOf(row: Row): HandoffVerdict | null {
    const reason = maybeText(row, 'reason');
    const outcome = text(row, 'outcome');
    if (reason === null) {
        return outcome === 'delivered' ? { outcome: 'delivered', reason: null } : null;
    }
    return outcome === 'refused' || outcome === 'unsupported' || outcome === 'failed' ? { outcome, reason } : null;
}

export class HandoffAnswersRepository implements HandoffAnswers {
    private readonly db: DatabaseSync;
    private readonly storable: StorablePair;
    private readonly now: () => number;
    private readonly insert: StatementSync;
    private readonly read: StatementSync;
    private readonly drop: StatementSync;

    constructor(db: DatabaseSync, storable: StorablePair, now: () => number = Date.now) {
        this.db = db;
        this.storable = storable;
        this.now = now;
        this.insert = db.prepare('INSERT INTO handoff_answer (id, at, outcome, reason) VALUES (?, ?, ?, ?)');
        this.read = db.prepare('SELECT at, outcome, reason FROM handoff_answer WHERE id = ?');
        this.drop = db.prepare('DELETE FROM handoff_answer WHERE at < ?');
    }

    answerHandoff(id: HandoffId, verdict: HandoffVerdict): void {
        const key = handoffBytesOf(id);
        if (key === null) {
            throw new RangeError('not a handoff id');
        }
        if (!this.storable(verdict.outcome, verdict.reason)) {
            throw new UnstorableHandoffReason(`handoff ${verdict.outcome} ${verdict.reason ?? 'delivered'} is not storable`);
        }
        writeTx(this.db, () => { this.insert.run(key, this.now(), verdict.outcome, verdict.reason); });
    }

    handoffAnswer(id: HandoffId): HandoffAnswerRow | null {
        const key = handoffBytesOf(id);
        return guarded(() => {
            const row = key === null ? null : one(this.read, key);
            const verdict = row === null ? null : verdictOf(row);
            return row === null || verdict === null ? null : { ...verdict, id, at: whole(row, 'at') };
        }, null);
    }

    prune(before: number): void {
        writeTx(this.db, () => { this.drop.run(before); });
    }
}
