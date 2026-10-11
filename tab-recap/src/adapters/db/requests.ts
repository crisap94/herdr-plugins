import type { DatabaseSync, StatementSync } from 'node:sqlite';
import { paneId, tabId } from '#src/recap/domain/ids.ts';
import type { HandoffId, TabId } from '#src/recap/domain/ids.ts';
import { err, ok, type Result } from '#src/protocol/result.ts';
import type { CompactionQueue, CompactRequest, HandoffRequestRow, NewHandoffRequest, Requests, VisibilityRequest } from '#src/ports/requests.ts';
import type { HandoffSource } from '#src/recap/domain/handoff-source.ts';
import { originOf } from '#src/recap/domain/origin.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';
import { parseInstant } from '#src/recap/domain/time.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { handoffBytesOf, handoffIdOf } from './handoff-ids.ts';
import { all, blob, flag, guarded, isRow, maybeText, text, whole } from './rows.ts';
import { compareIds, ids } from './uuid7.ts';
import type { Row } from './rows.ts';

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

function handoffRowOf(row: Row): HandoffRequestRow | null {
    const tab = text(row, 'target');
    const pane = maybeText(row, 'pane');
    const toPane = maybeText(row, 'to_pane');
    const source = parseSourceRow(row);
    return tab === '' || pane === null || toPane === null || source.kind === 'err' ? null : { id: handoffIdOf(blob(row, 'id')), at: whole(row, 'at'), tab: tabId(tab), pane: paneId(pane), toPane: paneId(toPane), refreshFirst: flag(row, 'refresh_first'), note: maybeText(row, 'note'), source: source.value };
}

function wordOf(hidden: boolean | 'toggle'): string {
    if (hidden === 'toggle') {
        return 'toggle';
    }
    return hidden ? 'hide' : 'show';
}

export class RequestsRepository implements Requests, CompactionQueue {
    private readonly now: () => number;
    private readonly refresh: StatementSync;
    private readonly visibility: StatementSync;
    private readonly compact: StatementSync;
    private readonly takeCompact: StatementSync;
    private readonly curate: StatementSync;
    private readonly takeCurate: StatementSync;
    private readonly takeRefresh: StatementSync;
    private readonly takeHidden: StatementSync;
    private readonly takeAnsweredRows: StatementSync;
    private readonly queuedCompact: StatementSync;
    private readonly insertHandoff: StatementSync;
    private readonly withdrawHandoffRow: StatementSync;
    private readonly takeHandoffRows: StatementSync;

    constructor(db: DatabaseSync, now: () => number = Date.now) {
        this.now = now;
        this.refresh = db.prepare("INSERT INTO request (id, at, kind, target) VALUES (?, ?, 'refresh', ?)");
        this.visibility = db.prepare("INSERT INTO request (id, at, kind, target, hidden) VALUES (?, ?, 'visibility', ?, ?)");
        this.compact = db.prepare("INSERT INTO request (id, at, kind, target, pane, note, origin, answer) VALUES (?, ?, 'compact', ?, ?, ?, ?, ?)");
        this.curate = db.prepare("INSERT INTO request (id, at, kind, target) VALUES (?, ?, 'curate', ?)");
        this.takeCurate = db.prepare("DELETE FROM request WHERE kind = 'curate' RETURNING id, target");
        this.takeCompact = db.prepare("DELETE FROM request WHERE kind = 'compact' RETURNING id, target, pane, note, origin, answer");
        this.takeRefresh = db.prepare("DELETE FROM request WHERE kind = 'refresh' RETURNING id, target");
        this.takeHidden = db.prepare("DELETE FROM request WHERE kind = 'visibility' RETURNING id, target, hidden");
        this.takeAnsweredRows = db.prepare("DELETE FROM request WHERE kind = 'compact' AND answer IS NOT NULL RETURNING id, pane, answer");
        this.queuedCompact = db.prepare("SELECT 1 FROM request WHERE kind = 'compact' AND target = ? AND (pane = ? OR pane IS NULL) LIMIT 1");
        this.insertHandoff = db.prepare("INSERT INTO request (id, at, kind, target, pane, to_pane, note, refresh_first, closed_at) VALUES (?, ?, 'handoff', ?, ?, ?, ?, ?, ?)");
        this.withdrawHandoffRow = db.prepare("DELETE FROM request WHERE kind = 'handoff' AND id = ?");
        this.takeHandoffRows = db.prepare("DELETE FROM request WHERE kind = 'handoff' RETURNING id, at, target, pane, to_pane, note, refresh_first, closed_at");
    }

    compactQueued(tab: string, pane: string): boolean {
        return guarded(() => this.queuedCompact.get(tab, pane) !== undefined, false);
    }

    request(tab: string): void {
        this.refresh.run(ids.next(), this.now(), tab);
    }

    requestVisibility(request: VisibilityRequest): void {
        this.visibility.run(ids.next(), this.now(), request.target, wordOf(request.hidden));
    }

    requestCompact(request: CompactRequest): void {
        this.compact.run(ids.next(), this.now(), request.tab, request.pane, request.note, request.origin ?? 'operator', request.answer ?? null);
    }

    requestCurate(tab: string): void {
        this.curate.run(ids.next(), this.now(), tab);
    }

    requestHandoff(request: NewHandoffRequest): HandoffId {
        const id = ids.next();
        this.insertHandoff.run(id, this.now(), request.tab, request.pane, request.toPane, request.note, request.refreshFirst ? 1 : 0, closedAtOf(request.source));
        return handoffIdOf(id);
    }

    withdrawHandoff(id: HandoffId): boolean {
        const key = handoffBytesOf(id);
        return key !== null && Number(this.withdrawHandoffRow.run(key).changes) > 0;
    }

    takeHandoffs(): readonly HandoffRequestRow[] {
        return guarded(() => all(this.takeHandoffRows).toSorted((a, b) => compareIds(blob(a, 'id'), blob(b, 'id'))).flatMap((row) => handoffRowOf(row) ?? []), []);
    }

    takeAnswered(): readonly { readonly pane: string; readonly answer: string }[] {
        return guarded(() => all(this.takeAnsweredRows).flatMap((row) => { const pane = maybeText(row, 'pane'); return pane === null ? [] : [{ pane, answer: text(row, 'answer') }]; }), []);
    }

    takeCurations(): readonly TabId[] {
        return guarded(() => [...new Set(all(this.takeCurate).toSorted((a, b) => compareIds(blob(a, 'id'), blob(b, 'id'))).map((row) => text(row, 'target')).filter((tab) => tab !== ''))].map(tabId), []);
    }

    takeCompactions(): readonly CompactRequest[] {
        return guarded(() => all(this.takeCompact).toSorted((a, b) => compareIds(blob(a, 'id'), blob(b, 'id'))).flatMap((row) => compactionOf(row) ?? []), []);
    }

    takeRequests(): readonly TabId[] {
        return guarded(() => [...new Set(all(this.takeRefresh).toSorted((a, b) => compareIds(blob(a, 'id'), blob(b, 'id'))).map((row) => text(row, 'target')).filter((tab) => tab !== ''))].map(tabId), []);
    }

    takeVisibility(): readonly VisibilityRequest[] {
        return guarded(() => all(this.takeHidden).toSorted((a, b) => compareIds(blob(a, 'id'), blob(b, 'id'))).flatMap((row) => visibilityOf(row) ?? []), []);
    }
}
