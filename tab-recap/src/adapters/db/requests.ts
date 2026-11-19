import type { Database } from 'bun:sqlite';
import { and, asc, eq, isNotNull, isNull, or } from 'drizzle-orm';
import { parsePaneId, parseTabId } from '#src/recap/domain/ids.ts';
import type { HandoffId, PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { Result } from '#src/protocol/result.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';
import { parseCompactAsk, parseHandoffAskRecord, parseVisibilityAsk } from '#src/ports/requests.ts';
import type { AnsweredPane, CompactAsk, CompactionAskQueue, HandoffAsk, HandoffAskRecord, Queued, RequestPort, Visibility, VisibilityAsk, Withdrawal } from '#src/ports/requests.ts';
import type { HandoffSource } from '#src/recap/domain/handoff-source.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { writeTx } from './connection.ts';
import { handoffBytesOf, handoffIdOf } from './handoff-ids.ts';
import { guarded } from './rows.ts';
import { ids } from './uuid7.ts';
import { request as requestTable } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';

export { RequestsRepository } from './legacy.ts';

const ORIGIN_DEFAULT = 'operator';

const HIDDEN_WORD: Readonly<Record<Visibility, string>> = { toggle: 'toggle', hidden: 'hide', shown: 'show' };

const VISIBILITY_OF_WORD = new Map<string | null, Visibility>([['toggle', 'toggle'], ['hide', 'hidden'], ['show', 'shown']]);

const systemClock = (): Instant => instant(Date.now());

const okOf = <T>(result: Result<T, ParseFailure>): T | null => (result.kind === 'ok' ? result.value : null);

function closedAtOf(source: HandoffSource): Instant | null {
    return source.kind === 'live' ? null : source.closedAt;
}

export class RequestsStore implements RequestPort, CompactionAskQueue {
    private readonly db: Database;
    private readonly now: () => Instant;
    private readonly orm: Orm;

    constructor(db: Database, now: () => Instant = systemClock) {
        this.db = db;
        this.now = now;
        this.orm = ormOf(db);
    }

    compactQueued(tab: TabId, pane: PaneId): Queued {
        return guarded((): Queued => (this.orm.select().from(requestTable).where(and(eq(requestTable.kind, 'compact'), eq(requestTable.target, tab), or(eq(requestTable.pane, pane), isNull(requestTable.pane)))).limit(1).all().length === 0 ? 'not-queued' : 'queued'), 'not-queued');
    }

    request(tab: TabId): void {
        this.orm.insert(requestTable).values({ id: ids.next(), at: this.now(), kind: 'refresh', target: tab, origin: ORIGIN_DEFAULT, refreshFirst: 0 }).run();
    }

    requestVisibility(request: VisibilityAsk): void {
        this.orm.insert(requestTable).values({ id: ids.next(), at: this.now(), kind: 'visibility', target: request.target, hidden: HIDDEN_WORD[request.visibility], origin: ORIGIN_DEFAULT, refreshFirst: 0 }).run();
    }

    requestCompact(request: CompactAsk): void {
        this.orm.insert(requestTable).values({ id: ids.next(), at: this.now(), kind: 'compact', target: request.tab, pane: request.pane, note: request.note, origin: request.origin ?? ORIGIN_DEFAULT, answer: request.answer ?? null, refreshFirst: 0 }).run();
    }

    requestCurate(tab: TabId): void {
        this.orm.insert(requestTable).values({ id: ids.next(), at: this.now(), kind: 'curate', target: tab, origin: ORIGIN_DEFAULT, refreshFirst: 0 }).run();
    }

    requestHandoff(request: HandoffAsk): HandoffId {
        const id = ids.next();
        this.orm.insert(requestTable).values({
            id, at: this.now(), kind: 'handoff', target: request.tab, pane: request.pane, toPane: request.toPane, note: request.note, origin: ORIGIN_DEFAULT,
            refreshFirst: request.refresh === 'refresh-first' ? 1 : 0, closedAt: closedAtOf(request.source), answer: request.answer ?? null,
        }).run();
        return handoffIdOf(id);
    }

    withdrawHandoff(id: HandoffId): Withdrawal {
        const key = handoffBytesOf(id);
        const removed = key !== null && this.orm.delete(requestTable).where(and(eq(requestTable.kind, 'handoff'), eq(requestTable.id, key))).returning({ id: requestTable.id }).all().length > 0;
        return removed ? 'withdrawn' : 'not-found';
    }

    takeHandoffs(): readonly HandoffAskRecord[] {
        return guarded(() => writeTx(this.db, () => {
            const rows = this.orm.select().from(requestTable).where(eq(requestTable.kind, 'handoff')).orderBy(asc(requestTable.id)).all();
            this.orm.delete(requestTable).where(eq(requestTable.kind, 'handoff')).run();
            return rows.flatMap((row) => okOf(parseHandoffAskRecord({
                id: handoffIdOf(row.id), at: row.at, tab: row.target, pane: row.pane, toPane: row.toPane,
                refresh: row.refreshFirst === 1 ? 'refresh-first' : 'as-is', note: row.note,
                source: row.closedAt === null ? { kind: 'live' } : { kind: 'closed', closedAt: row.closedAt }, answer: row.answer,
            })) ?? []);
        }), []);
    }

    takeAnswered(): readonly AnsweredPane[] {
        return guarded(() => writeTx(this.db, () => {
            const where = and(eq(requestTable.kind, 'compact'), isNotNull(requestTable.answer));
            const rows = this.orm.select().from(requestTable).where(where).orderBy(asc(requestTable.id)).all();
            this.orm.delete(requestTable).where(where).run();
            return rows.flatMap((row): readonly AnsweredPane[] => {
                const pane = okOf(parsePaneId(row.pane));
                const answer = okOf(parseText(row.answer));
                return pane === null || answer === null ? [] : [{ pane, answer }];
            });
        }), []);
    }

    takeCurations(): readonly TabId[] {
        return guarded(() => writeTx(this.db, () => {
            const rows = this.orm.select().from(requestTable).where(eq(requestTable.kind, 'curate')).orderBy(asc(requestTable.id)).all();
            this.orm.delete(requestTable).where(eq(requestTable.kind, 'curate')).run();
            return [...new Set(rows.flatMap((row) => okOf(parseTabId(row.target)) ?? []))];
        }), []);
    }

    takeCompactions(): readonly CompactAsk[] {
        return guarded(() => writeTx(this.db, () => {
            const rows = this.orm.select().from(requestTable).where(eq(requestTable.kind, 'compact')).orderBy(asc(requestTable.id)).all();
            this.orm.delete(requestTable).where(eq(requestTable.kind, 'compact')).run();
            return rows.flatMap((row) => okOf(parseCompactAsk({ tab: row.target, pane: row.pane, note: row.note, origin: row.origin, answer: row.answer })) ?? []);
        }), []);
    }

    takeRequests(): readonly TabId[] {
        return guarded(() => writeTx(this.db, () => {
            const rows = this.orm.select().from(requestTable).where(eq(requestTable.kind, 'refresh')).orderBy(asc(requestTable.id)).all();
            this.orm.delete(requestTable).where(eq(requestTable.kind, 'refresh')).run();
            return [...new Set(rows.flatMap((row) => okOf(parseTabId(row.target)) ?? []))];
        }), []);
    }

    takeVisibility(): readonly VisibilityAsk[] {
        return guarded(() => writeTx(this.db, () => {
            const rows = this.orm.select().from(requestTable).where(eq(requestTable.kind, 'visibility')).orderBy(asc(requestTable.id)).all();
            this.orm.delete(requestTable).where(eq(requestTable.kind, 'visibility')).run();
            return rows.flatMap((row) => okOf(parseVisibilityAsk({ target: row.target, visibility: VISIBILITY_OF_WORD.get(row.hidden) ?? 'shown' })) ?? []);
        }), []);
    }
}
