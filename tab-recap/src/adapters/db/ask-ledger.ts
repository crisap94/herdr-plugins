import type { Database } from 'bun:sqlite';
import { and, asc, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { LOCAL_REQUESTER } from '#src/ports/ask-ledger.ts';
import type { Ask, AskIdentity, AskKey, AskLedger, NewAsk, Requester } from '#src/ports/ask-ledger.ts';
import { exchangeName, requestId, toolName } from '#src/protocol/primitives.ts';
import type { ExchangeName } from '#src/protocol/primitives.ts';
import { outcomeOf, outcomeText } from '#src/recap/domain/ask-outcome.ts';
import type { AskOutcome } from '#src/recap/domain/ask-outcome.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import { ask as asks } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { guarded, maybeText, text, whole } from './rows.ts';
import type { Row } from './rows.ts';
import { writeTx } from './connection.ts';

const requesterOf = (raw: string): Requester | null => {
    if (raw === LOCAL_REQUESTER) {
        return LOCAL_REQUESTER;
    }
    const parsed = toolName(raw);
    return parsed.kind === 'ok' ? parsed.value : null;
};

function askOf(row: Row, log: (line: string) => void): readonly Ask[] {
    const exchange = exchangeName(text(row, 'exchange'));
    const requester = requesterOf(text(row, 'requester'));
    const id = requestId(text(row, 'id'), 'legacy-length');
    const raw = maybeText(row, 'outcome');
    const outcome = raw === null ? null : outcomeOf(raw);
    if (exchange.kind !== 'ok' || requester === null || id.kind !== 'ok' || (raw !== null && outcome === null)) {
        log(`ask ledger: a row this build cannot read is left out (exchange ${text(row, 'exchange')}, requester ${text(row, 'requester')})`);
        return [];
    }
    return [{ exchange: exchange.value, requester, id: id.value, pane: paneId(text(row, 'pane')), at: whole(row, 'at'), ref: maybeText(row, 'ref'), outcome }];
}

export class AskLedgerRepository implements AskLedger {
    private readonly orm: Orm;
    private readonly db: Database;
    private readonly log: (line: string) => void;

    constructor(db: Database, log: (line: string) => void = (): void => undefined) {
        this.db = db;
        this.orm = ormOf(db);
        this.log = log;
    }

    seen(exchange: ExchangeName, requester: Requester, id: string): boolean {
        return guarded(() => this.orm.select({ found: sql<number>`1` }).from(asks)
            .where(and(eq(asks.exchange, exchange), eq(asks.requester, requester), eq(asks.id, id))).get() !== undefined, true);
    }

    record(ask: NewAsk): void {
        writeTx(this.db, () => {
            this.orm.insert(asks).values({ exchange: ask.exchange, requester: ask.requester, id: ask.id, pane: ask.pane, at: ask.at, ref: ask.ref, outcome: null })
                .onConflictDoNothing().run();
        });
    }

    attach(match: AskKey, ref: string): void {
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

    unfinished(): readonly Ask[] {
        return guarded(() => this.orm.select({ exchange: asks.exchange, requester: asks.requester, id: asks.id, pane: asks.pane, at: asks.at, ref: asks.ref, outcome: asks.outcome })
            .from(asks).where(isNull(asks.outcome)).orderBy(asc(asks.at), asc(asks.requester), asc(asks.id)).all()
            .flatMap((row) => askOf(row, this.log)), []);
    }

    prune(before: number): void {
        writeTx(this.db, () => { this.orm.delete(asks).where(and(lt(asks.at, before), isNotNull(asks.outcome))).run(); });
    }
}
