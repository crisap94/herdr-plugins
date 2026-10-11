import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { ClosedLaneList, ClosedLaneRead, ClosedLaneRecord, ClosureAssociation, ClosureReader, ClosureRecorder, ClosureRuns, ClosureSweep } from '#src/ports/closed-lanes.ts';
import type { LastRun } from '#src/ports/recap-records.ts';
import type { Unknown } from '#src/ports/unknowable.ts';
import type { ClosedLane, ClosedLaneIdentity } from '#src/recap/domain/closures.ts';
import type { TaskId } from '#src/recap/domain/fact.ts';
import { agentKind, paneId, tabId } from '#src/recap/domain/ids.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import { RECAP_CAUSES } from '#src/recap/domain/intent.ts';
import { cutoffOf } from '#src/recap/domain/retention.ts';
import type { ClosedLaneDays } from '#src/recap/domain/retention.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { writeTx } from './connection.ts';
import { all, maybeText, one, text, whole } from './rows.ts';
import type { Row } from './rows.ts';

interface Statements {
    readonly insert: StatementSync;
    readonly byKey: StatementSync;
    readonly listed: StatementSync;
    readonly protectedTabs: StatementSync;
    readonly expiredTabs: StatementSync;
    readonly countOf: StatementSync;
    readonly prune: StatementSync;
}

const ROW = 'SELECT c.pane, c.closed_at, c.agent, c.cwd, c.task_name, k.key FROM closed_lane c LEFT JOIN task k ON k.id = c.task_id';

const LAST_RUN_AT = 'SELECT r.at AS at, r.cause AS cause FROM run r JOIN run_task rt ON rt.run_id = r.id JOIN task k ON k.id = rt.task_id WHERE k.tab_id = ? AND k.key = ? AND r.at <= ? ORDER BY r.at DESC, r.id DESC LIMIT 1';

const causeOf = (raw: string): LastRun['cause'] | null => (raw === 'imported' ? 'imported' : RECAP_CAUSES.find((cause) => cause === raw) ?? null);

const ASSOCIATE = `WITH hit AS (
  SELECT l.task_id, rt.name AS name FROM run_task_lane l
  JOIN transcript t ON t.id = l.transcript_id
  JOIN run r ON r.id = l.run_id
  JOIN run_task rt ON rt.run_id = l.run_id AND rt.task_id = l.task_id
  WHERE t.tab_id = ? AND t.pane = ? AND t.first_seen >= ? AND t.first_seen <= ?
  ORDER BY r.at DESC, r.id DESC
  LIMIT 1
)
INSERT OR IGNORE INTO closed_lane (tab_id, pane, closed_at, agent, cwd, task_id, task_name)
SELECT ?, ?, ?, ?, ?, hit.task_id, hit.name FROM (SELECT 1) LEFT JOIN hit ON 1`;

const unreadable = (error: unknown): Unknown => ({ kind: 'unknown', why: { why: 'unreadable', detail: String(error) } });

const windowOf = (now: Instant, days: ClosedLaneDays): { readonly off: number; readonly cutoff: number } => {
    const cutoff = cutoffOf(now, days);
    return cutoff === null ? { off: 1, cutoff: 0 } : { off: 0, cutoff };
};

const associationOf = (row: Row, tab: TabId): ClosureAssociation | null => {
    const key = maybeText(row, 'key');
    return key === null ? null : { task: { tab, key }, name: maybeText(row, 'task_name') };
};

const recordOf = (row: Row, tab: TabId): ClosedLaneRecord => ({
    tab,
    pane: paneId(text(row, 'pane')),
    agent: agentKind(text(row, 'agent')),
    closedAt: instant(whole(row, 'closed_at')),
    cwd: maybeText(row, 'cwd'),
    association: associationOf(row, tab),
});

export class ClosedLanesRepository implements ClosureRecorder, ClosureReader, ClosureRuns, ClosureSweep {
    private readonly db: DatabaseSync;
    private readonly days: ClosedLaneDays;
    private readonly statements: Statements | null;
    private readonly lastRunAt: StatementSync;

    constructor(db: DatabaseSync, days: ClosedLaneDays) {
        this.db = db;
        this.days = days;
        this.lastRunAt = db.prepare(LAST_RUN_AT);
        const present = one(db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'closed_lane'")) !== null;
        this.statements = present ? {
            insert: db.prepare(ASSOCIATE),
            byKey: db.prepare(`${ROW} WHERE c.tab_id = ? AND c.pane = ? AND c.closed_at = ?`),
            listed: db.prepare(`${ROW} WHERE c.tab_id = ? AND ? = 0 AND c.closed_at >= ? ORDER BY c.closed_at DESC, c.pane`),
            protectedTabs: db.prepare('SELECT DISTINCT tab_id AS id FROM closed_lane WHERE ? = 0 AND closed_at >= ? ORDER BY tab_id'),
            expiredTabs: db.prepare('SELECT DISTINCT tab_id AS id FROM closed_lane WHERE ? = 1 OR closed_at < ? ORDER BY tab_id'),
            countOf: db.prepare('SELECT COUNT(*) AS n FROM closed_lane WHERE tab_id = ?'),
            prune: db.prepare('DELETE FROM closed_lane WHERE tab_id = ? AND (? = 1 OR closed_at < ?)'),
        } : null;
    }

    record(closed: ClosedLane): void {
        if (this.statements === null) {
            throw new Error('the closed-lane table is not migrated');
        }
        const { insert } = this.statements;
        writeTx(this.db, () => {
            insert.run(closed.tab, closed.pane, closed.since, closed.closedAt, closed.tab, closed.pane, closed.closedAt, closed.agent, closed.cwd);
        });
    }

    resolve(identity: ClosedLaneIdentity): ClosedLaneRead {
        const statements = this.statements;
        if (statements === null) {
            return { kind: 'absent' };
        }
        try {
            const row = one(statements.byKey, identity.tab, identity.pane, identity.closedAt);
            return row === null ? { kind: 'absent' } : { kind: 'row', record: recordOf(row, identity.tab) };
        } catch (error) {
            return unreadable(error);
        }
    }

    runAt(task: TaskId, at: Instant): LastRun | null {
        const row = one(this.lastRunAt, task.tab, task.key, at);
        const cause = row === null ? null : causeOf(text(row, 'cause'));
        return row === null || cause === null ? null : { at: whole(row, 'at'), cause };
    }

    listOf(tab: TabId, now: Instant): ClosedLaneList {
        const statements = this.statements;
        if (statements === null) {
            return { kind: 'listed', records: [] };
        }
        try {
            const { off, cutoff } = windowOf(now, this.days);
            return { kind: 'listed', records: all(statements.listed, tab, off, cutoff).map((row) => recordOf(row, tab)) };
        } catch (error) {
            return unreadable(error);
        }
    }

    protectedTabs(now: Instant): readonly TabId[] {
        const statements = this.statements;
        if (statements === null) {
            return [];
        }
        const { off, cutoff } = windowOf(now, this.days);
        return all(statements.protectedTabs, off, cutoff).map((row) => tabId(text(row, 'id')));
    }

    expiredTabs(now: Instant): readonly TabId[] {
        const statements = this.statements;
        if (statements === null) {
            return [];
        }
        const { off, cutoff } = windowOf(now, this.days);
        return all(statements.expiredTabs, off, cutoff).map((row) => tabId(text(row, 'id')));
    }

    countOf(tab: TabId): number {
        const statements = this.statements;
        return statements === null ? 0 : whole(one(statements.countOf, tab) ?? { n: 0 }, 'n');
    }

    pruneTab(tab: TabId, now: Instant): number {
        const statements = this.statements;
        if (statements === null) {
            return 0;
        }
        const { off, cutoff } = windowOf(now, this.days);
        return writeTx(this.db, () => Number(statements.prune.run(tab, off, cutoff).changes));
    }
}
