import type { Database } from 'bun:sqlite';
import { and, asc, count, desc, eq, gt, gte, lt, lte, sql } from 'drizzle-orm';
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
import { closedLane, run as runs, runTask as runTasks, task as tasks } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { retiredSince } from './retention.ts';
import { BadRow, isRow, one } from './rows.ts';

type WindowOff = 0 | 1;

interface ClosedWindow {
    readonly off: WindowOff;
    readonly cutoff: Instant;
}

type ClosedLaneRow = ClosedLaneRecord;

type Association = ClosureAssociation | null;

export type RunCause = LastRun['cause'];

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

const closedFields = {
    pane: closedLane.pane, closed_at: closedLane.closedAt, agent: closedLane.agent, cwd: closedLane.cwd, task_name: closedLane.taskName, key: tasks.key,
};

export class ClosedLanesRepository implements ClosureRecorder, ClosureReader, ClosureRuns, ClosureSweep {
    private readonly db: Database;
    private readonly orm: Orm;
    private readonly days: ClosedLaneDays;
    private readonly present: boolean;

    constructor(db: Database, days: ClosedLaneDays) {
        this.db = db;
        this.orm = ormOf(db);
        this.days = days;
        this.present = one(db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'closed_lane'")) !== null;
    }

    record(closed: ClosedLane): void {
        if (!this.present) {
            throw new Error('the closed-lane table is not migrated');
        }
        writeTx(this.db, () => {
            this.orm.run(sql`WITH hit AS (
  SELECT l.task_id, rt.name AS name FROM run_task_lane l
  JOIN transcript t ON t.id = l.transcript_id
  JOIN run r ON r.id = l.run_id
  JOIN run_task rt ON rt.run_id = l.run_id AND rt.task_id = l.task_id
  WHERE t.tab_id = ${closed.tab} AND t.pane = ${closed.pane} AND t.first_seen >= ${closed.since} AND t.first_seen <= ${closed.closedAt} AND r.at <= ${closed.closedAt}
  ORDER BY r.at DESC, r.id DESC
  LIMIT 1
)
INSERT OR IGNORE INTO closed_lane (tab_id, pane, closed_at, agent, cwd, task_id, task_name)
SELECT ${closed.tab}, ${closed.pane}, ${closed.closedAt}, ${closed.agent}, ${closed.cwd}, hit.task_id, hit.name FROM (SELECT 1) LEFT JOIN hit ON 1`);
        });
    }

    resolve(identity: ClosedLaneIdentity): ClosedLaneRead {
        if (!this.present) {
            return { kind: 'absent' };
        }
        try {
            const row = this.orm.select(closedFields).from(closedLane).leftJoin(tasks, eq(tasks.id, closedLane.taskId))
                .where(and(eq(closedLane.tabId, identity.tab), eq(closedLane.pane, identity.pane), eq(closedLane.closedAt, identity.closedAt))).get();
            return row === undefined ? { kind: 'absent' } : { kind: 'row', record: readOrThrow(parseClosedLaneRow(row, identity.tab)) };
        } catch (error) {
            return unreadableOf(failureCauseOf(error));
        }
    }

    runAt(task: TaskId, at: Instant): LastRun | null {
        const tab = parseTabId(task.tab);
        if (tab.kind === 'err') {
            return null;
        }
        const row = this.orm.select({ at: runs.at, cause: runs.cause }).from(runs)
            .innerJoin(runTasks, eq(runTasks.runId, runs.id)).innerJoin(tasks, eq(tasks.id, runTasks.taskId))
            .where(and(eq(tasks.tabId, tab.value), eq(tasks.key, task.key), lte(runs.at, at))).orderBy(desc(runs.at), desc(runs.id)).limit(1).get();
        if (row === undefined) {
            return null;
        }
        const cause = parseRunCause(row.cause);
        const when = parseInstant(row.at);
        return cause.kind === 'ok' && when.kind === 'ok' ? { at: when.value, cause: cause.value } : null;
    }

    listOf(tab: TabId, now: Instant): ClosedLaneList {
        if (!this.present) {
            return { kind: 'listed', records: [] };
        }
        try {
            const { off, cutoff } = windowOf(now, this.days);
            return { kind: 'listed', records: off === 1 ? [] : this.orm.select(closedFields).from(closedLane).leftJoin(tasks, eq(tasks.id, closedLane.taskId))
                .where(and(eq(closedLane.tabId, tab), gte(closedLane.closedAt, cutoff), gt(closedLane.closedAt, retiredSince(tab)))).orderBy(desc(closedLane.closedAt), asc(closedLane.pane)).all().map((row) => readOrThrow(parseClosedLaneRow(row, tab))) };
        } catch (error) {
            return unreadableOf(failureCauseOf(error));
        }
    }

    protectedTabs(now: Instant): readonly TabId[] {
        if (!this.present) {
            return [];
        }
        const { off, cutoff } = windowOf(now, this.days);
        return off === 1 ? [] : this.orm.selectDistinct({ id: closedLane.tabId }).from(closedLane)
            .where(gte(closedLane.closedAt, cutoff)).orderBy(asc(closedLane.tabId)).all().flatMap((row) => {
            const tab = parseTabId(row.id);
            return tab.kind === 'ok' ? [tab.value] : [];
        });
    }

    expiredTabs(now: Instant): readonly TabId[] {
        if (!this.present) {
            return [];
        }
        const window = windowOf(now, this.days);
        return this.orm.selectDistinct({ id: closedLane.tabId }).from(closedLane)
            .where(window.off === 1 ? undefined : lt(closedLane.closedAt, window.cutoff)).orderBy(asc(closedLane.tabId)).all().flatMap((row) => {
            const tab = parseTabId(row.id);
            return tab.kind === 'ok' ? [tab.value] : [];
        });
    }

    countOf(tab: TabId): Count {
        if (!this.present) {
            return NO_COUNT;
        }
        return countOrThrow(parseCount(this.orm.select({ n: count() }).from(closedLane).where(eq(closedLane.tabId, tab)).get()?.n ?? 0));
    }

    pruneTab(tab: TabId, now: Instant): Count {
        if (!this.present) {
            return NO_COUNT;
        }
        const window = windowOf(now, this.days);
        return writeTx(this.db, () => {
            const scope = and(eq(closedLane.tabId, tab), window.off === 1 ? undefined : lt(closedLane.closedAt, window.cutoff));
            const removed = countOrThrow(parseCount(this.orm.select({ n: count() }).from(closedLane).where(scope).get()?.n ?? 0));
            this.orm.delete(closedLane).where(scope).run();
            return removed;
        });
    }
}
