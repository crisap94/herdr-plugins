import type { DatabaseSync, StatementSync } from 'node:sqlite';
import { err, ok, type Result } from '#src/protocol/result.ts';
import type { ClosedLaneList, ClosedLaneRead, ClosedLaneRecord, ClosureAssociation, ClosureReader, ClosureRecorder, ClosureRuns, ClosureSweep } from '#src/ports/closed-lanes.ts';
import type { LastRun } from '#src/ports/recap-records.ts';
import { unreadableOf } from '#src/ports/unknowable.ts';
import { failureCauseOf } from '#src/recap/domain/failure-cause.ts';
import type { ClosedLane, ClosedLaneIdentity } from '#src/recap/domain/closures.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import type { Count } from '#src/recap/domain/count.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import type { TaskId } from '#src/recap/domain/fact.ts';
import { parseAgentKind, parsePaneId, parseTabId } from '#src/recap/domain/ids.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import { RECAP_CAUSES } from '#src/recap/domain/intent.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';
import { closedCutoffOf } from '#src/recap/domain/retention.ts';
import type { ClosedLaneDays } from '#src/recap/domain/retention.ts';
import { parseTaskName } from '#src/recap/domain/task-name.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { instant, parseInstant } from '#src/recap/domain/time.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { writeTx } from './connection.ts';
import { BadRow, all, isRow, one } from './rows.ts';

interface Statements {
    readonly insert: StatementSync;
    readonly byKey: StatementSync;
    readonly listed: StatementSync;
    readonly protectedTabs: StatementSync;
    readonly expiredTabs: StatementSync;
    readonly countOf: StatementSync;
    readonly prune: StatementSync;
}

type WindowOff = 0 | 1;

interface ClosedWindow {
    readonly off: WindowOff;
    readonly cutoff: Instant;
}

type ClosedLaneRow = ClosedLaneRecord;

type Association = ClosureAssociation | null;

export type RunCause = LastRun['cause'];

const ROW = 'SELECT c.pane, c.closed_at, c.agent, c.cwd, c.task_name, k.key FROM closed_lane c LEFT JOIN task k ON k.id = c.task_id';

const LAST_RUN_AT = 'SELECT r.at AS at, r.cause AS cause FROM run r JOIN run_task rt ON rt.run_id = r.id JOIN task k ON k.id = rt.task_id WHERE k.tab_id = ? AND k.key = ? AND r.at <= ? ORDER BY r.at DESC, r.id DESC LIMIT 1';

const NO_COUNT = countOrThrow(parseCount(0));

function countOrThrow(result: Result<Count, ParseFailure>): Count {
    if (result.kind === 'err') {
        throw new BadRow(`count is ${result.error.kind}`);
    }
    return result.value;
}

function readOrThrow(result: Result<ClosedLaneRow, ParseFailure>): ClosedLaneRow {
    if (result.kind === 'err') {
        throw new BadRow(`closed lane is ${result.error.kind}`);
    }
    return result.value;
}

export function parseRunCause(input: unknown): Result<RunCause, ParseFailure> {
    if (input === 'imported') {
        return ok('imported');
    }
    const cause = RECAP_CAUSES.find((candidate) => candidate === input);
    return cause === undefined ? err({ kind: 'out-of-range' }) : ok(cause);
}

const ASSOCIATE = `WITH hit AS (
  SELECT l.task_id, rt.name AS name FROM run_task_lane l
  JOIN transcript t ON t.id = l.transcript_id
  JOIN run r ON r.id = l.run_id
  JOIN run_task rt ON rt.run_id = l.run_id AND rt.task_id = l.task_id
  WHERE t.tab_id = ? AND t.pane = ? AND t.first_seen >= ? AND t.first_seen <= ? AND r.at <= ?
  ORDER BY r.at DESC, r.id DESC
  LIMIT 1
)
INSERT OR IGNORE INTO closed_lane (tab_id, pane, closed_at, agent, cwd, task_id, task_name)
SELECT ?, ?, ?, ?, ?, hit.task_id, hit.name FROM (SELECT 1) LEFT JOIN hit ON 1`;

const windowOf = (now: Instant, days: ClosedLaneDays): ClosedWindow => {
    const cutoff = closedCutoffOf(now, days);
    return cutoff === null ? { off: 1, cutoff: instant(0) } : { off: 0, cutoff };
};

export function parseAssociation(input: unknown, tab: TabId): Result<Association, ParseFailure> {
    if (!isRow(input)) {
        return err({ kind: 'not-a-row' });
    }
    if (input.key === null) {
        return ok(null);
    }
    const key = parseText(input.key);
    if (key.kind === 'err') {
        return key;
    }
    const name = input.task_name === null ? ok(null) : parseTaskName(input.task_name);
    if (name.kind === 'err') {
        return name;
    }
    return ok({ task: { tab, key: key.value }, name: name.value });
}

export function parseClosedLaneRow(input: unknown, tab: TabId): Result<ClosedLaneRow, ParseFailure> {
    if (!isRow(input)) {
        return err({ kind: 'not-a-row' });
    }
    const pane = parsePaneId(input.pane);
    if (pane.kind === 'err') {
        return pane;
    }
    const agent = parseAgentKind(input.agent);
    if (agent.kind === 'err') {
        return agent;
    }
    const closedAt = parseInstant(input.closed_at);
    if (closedAt.kind === 'err') {
        return closedAt;
    }
    const cwd = input.cwd === null ? ok(null) : parseDirectory(input.cwd);
    if (cwd.kind === 'err') {
        return cwd;
    }
    const association = parseAssociation(input, tab);
    if (association.kind === 'err') {
        return association;
    }
    return ok({ tab, pane: pane.value, agent: agent.value, closedAt: closedAt.value, cwd: cwd.value, association: association.value });
}

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
            insert.run(closed.tab, closed.pane, closed.since, closed.closedAt, closed.closedAt, closed.tab, closed.pane, closed.closedAt, closed.agent, closed.cwd);
        });
    }

    resolve(identity: ClosedLaneIdentity): ClosedLaneRead {
        const statements = this.statements;
        if (statements === null) {
            return { kind: 'absent' };
        }
        try {
            const row = one(statements.byKey, identity.tab, identity.pane, identity.closedAt);
            return row === null ? { kind: 'absent' } : { kind: 'row', record: readOrThrow(parseClosedLaneRow(row, identity.tab)) };
        } catch (error) {
            return unreadableOf(failureCauseOf(error));
        }
    }

    runAt(task: TaskId, at: Instant): LastRun | null {
        const row = one(this.lastRunAt, task.tab, task.key, at);
        if (row === null) {
            return null;
        }
        const cause = parseRunCause(row.cause);
        const when = parseInstant(row.at);
        return cause.kind === 'ok' && when.kind === 'ok' ? { at: when.value, cause: cause.value } : null;
    }

    listOf(tab: TabId, now: Instant): ClosedLaneList {
        const statements = this.statements;
        if (statements === null) {
            return { kind: 'listed', records: [] };
        }
        try {
            const { off, cutoff } = windowOf(now, this.days);
            return { kind: 'listed', records: all(statements.listed, tab, off, cutoff).map((row) => readOrThrow(parseClosedLaneRow(row, tab))) };
        } catch (error) {
            return unreadableOf(failureCauseOf(error));
        }
    }

    protectedTabs(now: Instant): readonly TabId[] {
        const statements = this.statements;
        if (statements === null) {
            return [];
        }
        const { off, cutoff } = windowOf(now, this.days);
        return all(statements.protectedTabs, off, cutoff).flatMap((row) => {
            const tab = parseTabId(row.id);
            return tab.kind === 'ok' ? [tab.value] : [];
        });
    }

    expiredTabs(now: Instant): readonly TabId[] {
        const statements = this.statements;
        if (statements === null) {
            return [];
        }
        const { off, cutoff } = windowOf(now, this.days);
        return all(statements.expiredTabs, off, cutoff).flatMap((row) => {
            const tab = parseTabId(row.id);
            return tab.kind === 'ok' ? [tab.value] : [];
        });
    }

    countOf(tab: TabId): Count {
        const statements = this.statements;
        if (statements === null) {
            return NO_COUNT;
        }
        return countOrThrow(parseCount(one(statements.countOf, tab)?.n ?? 0));
    }

    pruneTab(tab: TabId, now: Instant): Count {
        const statements = this.statements;
        if (statements === null) {
            return NO_COUNT;
        }
        const { off, cutoff } = windowOf(now, this.days);
        return writeTx(this.db, () => countOrThrow(parseCount(Number(statements.prune.run(tab, off, cutoff).changes))));
    }
}
