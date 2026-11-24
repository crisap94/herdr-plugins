import type { Database } from 'bun:sqlite';
import { eq, lt } from 'drizzle-orm';
import type { HandoffAnswerRecord, HandoffAnswerStore } from '#src/ports/handoff-answers.ts';
import { must } from '@stateforge-labs/session-ledger';
import { parseStoredHandoffOutcome, type StoredHandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { HandoffId } from '#src/recap/domain/ids.ts';
import { parseText } from '@stateforge-labs/session-ledger';
import { instant, type Instant } from '@stateforge-labs/session-ledger';
import { handoffAnswer } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { writeTransaction } from '@stateforge-labs/session-ledger-sqlite/unstable/connection.ts';
import { handoffBytesOf } from './handoff-ids.ts';
import { guarded } from './rows.ts';

const wallClock = (): Instant => instant(Date.now());

export class HandoffAnswerRepository implements HandoffAnswerStore {
    private readonly db: Database;
    private readonly orm: Orm;
    private readonly now: () => Instant;

    constructor(db: Database, now: () => Instant = wallClock) {
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
        writeTransaction(this.db, () => {
            const known = this.orm.select({ at: handoffAnswer.at }).from(handoffAnswer).where(eq(handoffAnswer.id, key)).get() ?? null;
            if (known === null) {
                this.orm.insert(handoffAnswer).values({ id: key, at: this.now(), outcome: outcome.kind, reason }).run();
            }
        });
    }

    handoffAnswer(id: HandoffId): HandoffAnswerRecord | null {
        const key = handoffBytesOf(id);
        return guarded((): HandoffAnswerRecord | null => {
            const row = key === null ? null : this.orm.select({ at: handoffAnswer.at, outcome: handoffAnswer.outcome, reason: handoffAnswer.reason }).from(handoffAnswer).where(eq(handoffAnswer.id, key)).get() ?? null;
            const parsed = row === null ? null : parseStoredHandoffOutcome(row.outcome, row.reason);
            if (row === null || parsed === null || parsed.kind === 'err') return null;
            const stored: StoredHandoffOutcome = parsed.value;
            return { kind: stored.kind, reason: 'reason' in stored ? must(parseText(stored.reason)) : null, id, at: instant(row.at) };
        }, null);
    }

    prune(before: Instant): void {
        writeTransaction(this.db, () => { this.orm.delete(handoffAnswer).where(lt(handoffAnswer.at, before)).run(); });
    }
}
