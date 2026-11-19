import type { Database } from 'bun:sqlite';
import { and, asc, desc, eq, gte, or } from 'drizzle-orm';
import type { Applied } from '#src/ports/ledger.ts';
import { isClosedWhy, isSection } from '#src/recap/domain/fact.ts';
import type { Fact, FactId, TaskId } from '#src/recap/domain/fact.ts';
import { apply } from '#src/recap/domain/ops.ts';
import type { Operation, RunRef } from '#src/recap/domain/ops.ts';
import { tabId, type TabId } from '#src/recap/domain/ids.ts';
import { parseTaskName, type TaskName } from '#src/recap/domain/task-name.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { blob, BadRow, isRow, maybeText, maybeWhole, text, whole } from './rows.ts';
import { fact as factTable, task as taskTable } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { typeIdOf, idOf } from './typeid.ts';
import { ids } from './uuid7.ts';

const OPEN = 'open';
const CLOSED = 'closed';
const FOLD_WINDOW_MS = 24 * 3_600_000;

type SweepNow = 'sweep' | 'keep';

const FACT_COLUMNS = {
    id: factTable.id, section: factTable.section, text: factTable.text, why: factTable.why, ref: factTable.ref, agent: factTable.agent, anchor: factTable.anchor,
    first_at: factTable.firstAt, last_at: factTable.lastAt, state: factTable.state, closed_why: factTable.closedWhy, closed_at: factTable.closedAt, language: factTable.language,
};

export type LedgerFact = Fact;
export type LedgerFactId = FactId;

export const isLedgerFactId = (input: unknown): input is LedgerFactId => typeof input === 'string' && input.startsWith('fct_');

export function parseLedgerFact(input: unknown, task: TaskId): LedgerFact {
    if (!isRow(input)) {
        throw new BadRow('a fact is not a row');
    }
    const [id, section, closedWhy, state] = [typeIdOf('fact', blob(input, 'id')), text(input, 'section'), maybeText(input, 'closed_why'), text(input, 'state')];
    if (!isLedgerFactId(id) || !isSection(section) || (state !== OPEN && state !== CLOSED)) {
        throw new BadRow('a fact is not what the schema promises');
    }
    if (closedWhy !== null && !isClosedWhy(closedWhy)) {
        throw new BadRow('a fact closed for a reason the schema does not know');
    }
    return {
        id, task, section, text: text(input, 'text'), why: maybeText(input, 'why'), ref: maybeText(input, 'ref'), agent: maybeText(input, 'agent'), anchor: maybeText(input, 'anchor'),
        firstAt: whole(input, 'first_at'), lastAt: whole(input, 'last_at'), state, closedWhy, closedAt: maybeWhole(input, 'closed_at'), language: text(input, 'language'),
    };
}

export class LedgerRows {
    private readonly orm: Orm;

    constructor(db: Database) {
        this.orm = ormOf(db);
    }

    openOf(task: TaskId): readonly Fact[] {
        return this.orm.select(FACT_COLUMNS).from(factTable).innerJoin(taskTable, eq(taskTable.id, factTable.taskId)).where(and(eq(taskTable.tabId, tabId(task.tab)), eq(taskTable.key, task.key), eq(factTable.state, OPEN))).orderBy(desc(factTable.lastAt), asc(factTable.id)).all().map((row) => parseLedgerFact(row, task));
    }

    recentlyClosed(task: TaskId, since: Instant): readonly Fact[] {
        return this.orm.select(FACT_COLUMNS).from(factTable).innerJoin(taskTable, eq(taskTable.id, factTable.taskId)).where(and(eq(taskTable.tabId, tabId(task.tab)), eq(taskTable.key, task.key), eq(factTable.state, CLOSED), gte(factTable.closedAt, since))).orderBy(asc(factTable.closedAt), asc(factTable.id)).all().map((row) => parseLedgerFact(row, task));
    }

    allOf(task: TaskId): readonly Fact[] {
        return this.orm.select(FACT_COLUMNS).from(factTable).innerJoin(taskTable, eq(taskTable.id, factTable.taskId)).where(and(eq(taskTable.tabId, tabId(task.tab)), eq(taskTable.key, task.key))).orderBy(asc(factTable.firstAt), asc(factTable.id)).all().map((row) => parseLedgerFact(row, task));
    }

    keysOf(tab: TabId): readonly TaskName[] {
        return this.orm.selectDistinct({ key: taskTable.key }).from(factTable).innerJoin(taskTable, eq(taskTable.id, factTable.taskId))
            .where(eq(taskTable.tabId, tab)).orderBy(asc(taskTable.key)).all().map((row) => {
                const key = parseTaskName(text(row, 'key'));
                if (key.kind === 'err') {
                    throw new BadRow('a task key is empty');
                }
                return key.value;
            });
    }

    private taskRow(task: TaskId): Uint8Array {
        this.orm.insert(taskTable).values({ id: ids.next(), tabId: tabId(task.tab), key: task.key }).onConflictDoNothing().run();
        return blob(this.orm.select({ id: taskTable.id }).from(taskTable).where(and(eq(taskTable.tabId, tabId(task.tab)), eq(taskTable.key, task.key))).get() ?? {}, 'id');
    }

    private insertFact(run: Uint8Array, owner: Uint8Array, task: TaskId, f: Fact): void {
        const id = idOf('fact', f.id) ?? ids.next();
        this.orm.insert(factTable).values({
            id, tabId: tabId(task.tab), taskId: owner, section: f.section, text: f.text, why: f.why, ref: f.ref, agent: f.agent, anchor: f.anchor,
            firstAt: f.firstAt, lastAt: f.lastAt, state: f.state, closedWhy: f.closedWhy, closedAt: f.closedAt, bornRun: run, lastRun: run, language: f.language,
        }).run();
    }

    private updateFact(run: Uint8Array, f: Fact): void {
        const id = idOf('fact', f.id) ?? ids.next();
        this.orm.update(factTable).set({
            text: f.text, why: f.why, ref: f.ref, agent: f.agent, anchor: f.anchor, lastAt: f.lastAt, state: f.state, closedWhy: f.closedWhy, closedAt: f.closedAt,
            lastRun: run, language: f.language,
        }).where(eq(factTable.id, id)).run();
    }

    private persist(run: Uint8Array, task: TaskId, before: readonly Fact[], changed: readonly Fact[]): void {
        const owner = this.taskRow(task);
        for (const f of changed) {
            if (before.some((was) => was.id === f.id)) {
                this.updateFact(run, f);
            } else {
                this.insertFact(run, owner, task, f);
            }
        }
    }

    applyTo(run: Uint8Array, at: RunRef, ops: readonly Operation[], sweepNow: SweepNow = 'keep'): Applied {
        const before = this.orm.select(FACT_COLUMNS).from(factTable).innerJoin(taskTable, eq(taskTable.id, factTable.taskId)).where(and(eq(taskTable.tabId, tabId(at.task.tab)), eq(taskTable.key, at.task.key), or(eq(factTable.state, OPEN), gte(factTable.closedAt, at.at - FOLD_WINDOW_MS)))).orderBy(asc(factTable.firstAt), asc(factTable.id)).all().map((row) => parseLedgerFact(row, at.task));
        const folded = apply(before, ops, at, sweepNow === 'sweep');
        this.persist(run, at.task, before, folded.changed);
        return { changed: folded.changed, refused: folded.refused };
    }
}
