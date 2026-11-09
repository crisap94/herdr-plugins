import type { Database } from 'bun:sqlite';
import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';
import { paneId, tabId } from '#src/recap/domain/ids.ts';
import type { HandoffId, TabId } from '#src/recap/domain/ids.ts';
import { err, must, ok, type Result } from '#src/protocol/result.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { CompactionQueue, CompactRequest, HandoffRequestRow, NewHandoffRequest, Requests, VisibilityRequest } from '#src/ports/requests.ts';
import type { HandoffSource } from '#src/recap/domain/handoff-source.ts';
import { originOf } from '#src/recap/domain/origin.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';
import { parseInstant } from '#src/recap/domain/time.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { handoffBytesOf, handoffIdOf } from './handoff-ids.ts';
import { blob, flag, guarded, isRow, maybeText, text, whole } from './rows.ts';
import { compareIds, ids } from './uuid7.ts';
import type { Row } from './rows.ts';
import { request as requestTable } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';

function visibilityOf(row: Row): VisibilityRequest | null {
    const word = text(row, 'hidden');
    const target = text(row, 'target');
    return target === '' ? null : { target, hidden: word === 'toggle' ? 'toggle' : word === 'hide' };
}

function compactionOf(row: Row): CompactRequest | null {
    const tab = text(row, 'target');
    const answer = maybeText(row, 'answer');
    return tab === '' ? null : { tab, pane: maybeText(row, 'pane'), note: maybeText(row, 'note'), origin: originOf(text(row, 'origin')), ...(answer === null ? {} : { answer }) };
}

type SourceRow = HandoffSource;

export function parseSourceRow(input: unknown): Result<SourceRow, ParseFailure> {
    if (!isRow(input)) {
        return err({ kind: 'not-a-row' });
    }
    if (input.closed_at === null) {
        return ok({ kind: 'live' });
    }
    const closedAt = parseInstant(input.closed_at);
    if (closedAt.kind === 'err') {
        return closedAt;
    }
    return ok({ kind: 'closed', closedAt: closedAt.value });
}

function closedAtOf(source: HandoffSource): Instant | null {
    return source.kind === 'live' ? null : source.closedAt;
}

type Requester = Text;

export function parseRequester(input: unknown): Requester | null {
    return input === null ? null : must(parseText(input));
}

function handoffRowOf(row: Row): HandoffRequestRow | null {
    const tab = text(row, 'target');
    const pane = maybeText(row, 'pane');
    const toPane = maybeText(row, 'to_pane');
    const source = parseSourceRow(row);
    return tab === '' || pane === null || toPane === null || source.kind === 'err' ? null : { id: handoffIdOf(blob(row, 'id')), at: whole(row, 'at'), tab: tabId(tab), pane: paneId(pane), toPane: paneId(toPane), refreshFirst: flag(row, 'refresh_first'), note: maybeText(row, 'note'), source: source.value, answer: parseRequester(maybeText(row, 'answer')) };
}

const ORIGIN_DEFAULT = 'operator';

function idOrdered(rows: readonly Row[]): readonly Row[] {
    return rows.toSorted((a, b) => compareIds(blob(a, 'id'), blob(b, 'id')));
}

function wordOf(hidden: boolean | 'toggle'): string {
    if (hidden === 'toggle') {
        return 'toggle';
    }
    return hidden ? 'hide' : 'show';
}

const TARGET_VIEW = { id: requestTable.id, target: requestTable.target };
const VISIBILITY_VIEW = { id: requestTable.id, target: requestTable.target, hidden: requestTable.hidden };
const COMPACT_VIEW = { id: requestTable.id, target: requestTable.target, pane: requestTable.pane, note: requestTable.note, origin: requestTable.origin, answer: requestTable.answer };
const HANDOFF_VIEW = {
    id: requestTable.id, at: requestTable.at, target: requestTable.target, pane: requestTable.pane, to_pane: requestTable.toPane, note: requestTable.note,
    refresh_first: requestTable.refreshFirst, closed_at: requestTable.closedAt, answer: requestTable.answer,
};

export class RequestsRepository implements Requests, CompactionQueue {
    private readonly now: () => number;
    private readonly orm: Orm;

    constructor(db: Database, now: () => number = Date.now) {
        this.now = now;
        this.orm = ormOf(db);
    }

    compactQueued(tab: string, pane: string): boolean {
        return guarded(() => this.orm.select({ present: requestTable.id }).from(requestTable).where(and(eq(requestTable.kind, 'compact'), eq(requestTable.target, tab), or(eq(requestTable.pane, paneId(pane)), isNull(requestTable.pane)))).limit(1).get() !== undefined, false);
    }

    request(tab: string): void {
        this.orm.insert(requestTable).values({ id: ids.next(), at: this.now(), kind: 'refresh', target: tab, origin: ORIGIN_DEFAULT, refreshFirst: 0 }).run();
    }

    requestVisibility(request: VisibilityRequest): void {
        this.orm.insert(requestTable).values({ id: ids.next(), at: this.now(), kind: 'visibility', target: request.target, hidden: wordOf(request.hidden), origin: ORIGIN_DEFAULT, refreshFirst: 0 }).run();
    }

    requestCompact(request: CompactRequest): void {
        this.orm.insert(requestTable).values({ id: ids.next(), at: this.now(), kind: 'compact', target: request.tab, pane: request.pane === null ? null : paneId(request.pane), note: request.note, origin: request.origin ?? ORIGIN_DEFAULT, answer: request.answer ?? null, refreshFirst: 0 }).run();
    }

    requestCurate(tab: string): void {
        this.orm.insert(requestTable).values({ id: ids.next(), at: this.now(), kind: 'curate', target: tab, origin: ORIGIN_DEFAULT, refreshFirst: 0 }).run();
    }

    requestHandoff(request: NewHandoffRequest): HandoffId {
        const id = ids.next();
        this.orm.insert(requestTable).values({
            id, at: this.now(), kind: 'handoff', target: request.tab, pane: request.pane, toPane: request.toPane, note: request.note, origin: ORIGIN_DEFAULT,
            refreshFirst: request.refreshFirst ? 1 : 0, closedAt: closedAtOf(request.source), answer: request.answer ?? null,
        }).run();
        return handoffIdOf(id);
    }

    withdrawHandoff(id: HandoffId): boolean {
        const key = handoffBytesOf(id);
        return key !== null && this.orm.delete(requestTable).where(and(eq(requestTable.kind, 'handoff'), eq(requestTable.id, key))).returning({ id: requestTable.id }).all().length > 0;
    }

    takeHandoffs(): readonly HandoffRequestRow[] {
        return guarded(() => idOrdered(this.orm.delete(requestTable).where(eq(requestTable.kind, 'handoff')).returning(HANDOFF_VIEW).all()).flatMap((row) => handoffRowOf(row) ?? []), []);
    }

    takeAnswered(): readonly { readonly pane: string; readonly answer: string }[] {
        return guarded(() => this.orm.delete(requestTable).where(and(eq(requestTable.kind, 'compact'), isNotNull(requestTable.answer))).returning({ id: requestTable.id, pane: requestTable.pane, answer: requestTable.answer }).all().flatMap((row) => { const pane = maybeText(row, 'pane'); return pane === null ? [] : [{ pane, answer: text(row, 'answer') }]; }), []);
    }

    takeCurations(): readonly TabId[] {
        return guarded(() => [...new Set(idOrdered(this.orm.delete(requestTable).where(eq(requestTable.kind, 'curate')).returning(TARGET_VIEW).all()).map((row) => text(row, 'target')).filter((tab) => tab !== ''))].map(tabId), []);
    }

    takeCompactions(): readonly CompactRequest[] {
        return guarded(() => idOrdered(this.orm.delete(requestTable).where(eq(requestTable.kind, 'compact')).returning(COMPACT_VIEW).all()).flatMap((row) => compactionOf(row) ?? []), []);
    }

    takeRequests(): readonly TabId[] {
        return guarded(() => [...new Set(idOrdered(this.orm.delete(requestTable).where(eq(requestTable.kind, 'refresh')).returning(TARGET_VIEW).all()).map((row) => text(row, 'target')).filter((tab) => tab !== ''))].map(tabId), []);
    }

    takeVisibility(): readonly VisibilityRequest[] {
        return guarded(() => idOrdered(this.orm.delete(requestTable).where(eq(requestTable.kind, 'visibility')).returning(VISIBILITY_VIEW).all()).flatMap((row) => visibilityOf(row) ?? []), []);
    }
}
