// The Requests repository: what the columns and commands ask of the daemon, as rows it takes with `DELETE … RETURNING`.
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import { tabId } from '#src/recap/domain/ids.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import type { Requests, VisibilityRequest } from '#src/ports/requests.ts';
import { all, blob, guarded, text } from './rows.ts';
import { compareIds, ids } from './uuid7.ts';
import type { Row } from './rows.ts';

function visibilityOf(row: Row): VisibilityRequest | null {
    const word = text(row, 'hidden');
    const target = text(row, 'target');
    return target === '' ? null : { target, hidden: word === 'toggle' ? 'toggle' : word === 'hide' };
}

/** The word the table keeps for a visibility request. */
function wordOf(hidden: boolean | 'toggle'): string {
    if (hidden === 'toggle') {
        return 'toggle';
    }
    return hidden ? 'hide' : 'show';
}

export class RequestsRepository implements Requests {
    private readonly now: () => number;
    private readonly refresh: StatementSync;
    private readonly visibility: StatementSync;
    private readonly takeRefresh: StatementSync;
    private readonly takeHidden: StatementSync;

    constructor(db: DatabaseSync, now: () => number = Date.now) {
        this.now = now;
        this.refresh = db.prepare("INSERT INTO request (id, at, kind, target) VALUES (?, ?, 'refresh', ?)");
        this.visibility = db.prepare("INSERT INTO request (id, at, kind, target, hidden) VALUES (?, ?, 'visibility', ?, ?)");
        this.takeRefresh = db.prepare("DELETE FROM request WHERE kind = 'refresh' RETURNING id, target");
        this.takeHidden = db.prepare("DELETE FROM request WHERE kind = 'visibility' RETURNING id, target, hidden");
    }

    request(tab: string): void {
        this.refresh.run(ids.next(), this.now(), tab);
    }

    requestVisibility(request: VisibilityRequest): void {
        this.visibility.run(ids.next(), this.now(), request.target, wordOf(request.hidden));
    }

    /** One tab asked twice is one request. */
    takeRequests(): readonly TabId[] {
        return guarded(() => [...new Set(all(this.takeRefresh).toSorted((a, b) => compareIds(blob(a, 'id'), blob(b, 'id'))).map((row) => text(row, 'target')).filter((tab) => tab !== ''))].map(tabId), []);
    }

    /** In the order they were asked. */
    takeVisibility(): readonly VisibilityRequest[] {
        return guarded(() => all(this.takeHidden).toSorted((a, b) => compareIds(blob(a, 'id'), blob(b, 'id'))).flatMap((row) => visibilityOf(row) ?? []), []);
    }
}
