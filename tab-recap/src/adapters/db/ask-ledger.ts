import type { Database } from 'bun:sqlite';
import { and, asc, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { parseAskEntry } from '#src/ports/ask-ledger.ts';
import type { AskBook, AskDraft, AskEntry, AskIdentity, AskKey, AskSighting, Requester } from '#src/ports/ask-ledger.ts';
import type { ExchangeName, RequestId } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import { outcomeText } from '#src/recap/domain/ask-outcome.ts';
import type { AskOutcome } from '#src/recap/domain/ask-outcome.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { ask as asks } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { guarded } from './rows.ts';
import { writeTx } from './connection.ts';

const SEEN: AskSighting = 'seen';
const UNSEEN: AskSighting = 'unseen';

export class AskBookRepository implements AskBook {
    private readonly orm: Orm;
    private readonly db: Database;
    private readonly log: (line: Text) => void;

    constructor(db: Database, log: (line: Text) => void = (): void => undefined) {
        this.db = db;
        this.orm = ormOf(db);
        this.log = log;
    }

    seen(exchange: ExchangeName, requester: Requester, id: RequestId): AskSighting {
        return guarded(() => (this.orm.select({ found: sql<number>`1` }).from(asks)
            .where(and(eq(asks.exchange, exchange), eq(asks.requester, requester), eq(asks.id, id))).get() === undefined ? UNSEEN : SEEN), SEEN);
    }

    record(ask: AskDraft): void {
        writeTx(this.db, () => {
            this.orm.insert(asks).values({ exchange: ask.exchange, requester: ask.requester, id: ask.id, pane: ask.pane, at: ask.at, ref: ask.ref, outcome: null })
                .onConflictDoNothing().run();
        });
    }

    attach(match: AskKey, ref: Text): void {
        writeTx(this.db, () => {
            this.orm.update(asks).set({ ref }).where(and(eq(asks.exchange, match.exchange), eq(asks.id, match.id), eq(asks.pane, match.pane), isNull(asks.ref))).run();
        });
    }

    withdraw(identity: AskIdentity): void {
        writeTx(this.db, () => {
            this.orm.delete(asks).where(and(eq(asks.exchange, identity.exchange), eq(asks.requester, identity.requester), eq(asks.id, identity.id), isNull(asks.outcome))).run();
        });
    }

    settle(match: AskKey, outcome: AskOutcome): void {
        writeTx(this.db, () => {
            this.orm.update(asks).set({ outcome: outcomeText(outcome) }).where(and(eq(asks.exchange, match.exchange), eq(asks.id, match.id), eq(asks.pane, match.pane), isNull(asks.outcome))).run();
        });
    }

    unfinished(): readonly AskEntry[] {
        return guarded(() => this.orm.select({ exchange: asks.exchange, requester: asks.requester, id: asks.id, pane: asks.pane, at: asks.at, ref: asks.ref, outcome: asks.outcome })
            .from(asks).where(isNull(asks.outcome)).orderBy(asc(asks.at), asc(asks.requester), asc(asks.id)).all()
            .flatMap((row) => {
                const entry = parseAskEntry(row);
                if (entry.kind === 'ok') return [entry.value];
                this.log(must(parseText(`ask ledger: a row this build cannot read is left out (exchange ${row.exchange}, requester ${row.requester})`)));
                return [];
            }), []);
    }

    prune(before: Instant): void {
        writeTx(this.db, () => { this.orm.delete(asks).where(and(lt(asks.at, before), isNotNull(asks.outcome))).run(); });
    }
}
