import type { Database } from 'bun:sqlite';
import { and, asc, desc, eq, gte, or } from 'drizzle-orm';
import type { Applied } from '#src/ports/ledger.ts';
import { isClosedWhy, isSection } from '#src/recap/domain/fact.ts';
import type { ClosedWhy, Fact, FactId, TaskId } from '#src/recap/domain/fact.ts';
import { apply } from '#src/recap/domain/ops.ts';
import type { Operation, RunRef } from '#src/recap/domain/ops.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { blob, BadRow, maybeText, maybeWhole, text, whole } from './rows.ts';
import type { Row } from './rows.ts';
import { fact as factTable, task as taskTable } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { typeIdOf, idOf } from './typeid.ts';
import { ids } from './uuid7.ts';

const OPEN = 'open';
const CLOSED = 'closed';
const FOLD_WINDOW_MS = 24 * 3_600_000;

const FACT_COLUMNS = {
    id: factTable.id, section: factTable.section, text: factTable.text, why: factTable.why, ref: factTable.ref, agent: factTable.agent, anchor: factTable.anchor,
    first_at: factTable.firstAt, last_at: factTable.lastAt, state: factTable.state, closed_why: factTable.closedWhy, closed_at: factTable.closedAt, language: factTable.language,
};

function closedOf(value: string | null): ClosedWhy | null {
    if (value !== null && !isClosedWhy(value)) {
        throw new BadRow('a fact closed for a reason the schema does not know');
    }
    return value;
}

export class LedgerRows {
    private readonly orm: Orm;

    constructor(db: Database) {
        this.orm = ormOf(db);
    }

    private factOf(row: Row, task: TaskId): Fact {
        const [section, closedWhy, state] = [text(row, 'section'), maybeText(row, 'closed_why'), text(row, 'state')];
        if (!isSection(section) || (state !== OPEN && state !== CLOSED)) {
            throw new BadRow('a fact is not what the schema promises');
        }
        return {
            id: typeIdOf('fact', blob(row, 'id')) as FactId, task, section, text: text(row, 'text'), why: maybeText(row, 'why'), ref: maybeText(row, 'ref'), agent: maybeText(row, 'agent'), anchor: maybeText(row, 'anchor'),
            firstAt: whole(row, 'first_at'), lastAt: whole(row, 'last_at'), state, closedWhy: closedOf(closedWhy), closedAt: maybeWhole(row, 'closed_at'), language: text(row, 'language'),
        };
    }

    openOf(task: TaskId): readonly Fact[] {
        return this.orm.select(FACT_COLUMNS).from(factTable).innerJoin(taskTable, eq(taskTable.id, factTable.taskId)).where(and(eq(taskTable.tabId, tabId(task.tab)), eq(taskTable.key, task.key), eq(factTable.state, OPEN))).orderBy(desc(factTable.lastAt), asc(factTable.id)).all().map((row) => this.factOf(row, task));
    }

    recentlyClosed(task: TaskId, since: number): readonly Fact[] {
        return this.orm.select(FACT_COLUMNS).from(factTable).innerJoin(taskTable, eq(taskTable.id, factTable.taskId)).where(and(eq(taskTable.tabId, tabId(task.tab)), eq(taskTable.key, task.key), eq(factTable.state, CLOSED), gte(factTable.closedAt, since))).orderBy(asc(factTable.closedAt), asc(factTable.id)).all().map((row) => this.factOf(row, task));
    }

    allOf(task: TaskId): readonly Fact[] {
        return this.orm.select(FACT_COLUMNS).from(factTable).innerJoin(taskTable, eq(taskTable.id, factTable.taskId)).where(and(eq(taskTable.tabId, tabId(task.tab)), eq(taskTable.key, task.key))).orderBy(asc(factTable.firstAt), asc(factTable.id)).all().map((row) => this.factOf(row, task));
    }

    keysOf(tab: string): readonly string[] {
        return this.orm.selectDistinct({ key: taskTable.key }).from(factTable).innerJoin(taskTable, eq(taskTable.id, factTable.taskId))
            .where(eq(taskTable.tabId, tabId(tab))).orderBy(asc(taskTable.key)).all().map((row) => text(row, 'key'));
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

    applyTo(run: Uint8Array, at: RunRef, ops: readonly Operation[], sweepNow = false): Applied {
        const before = this.orm.select(FACT_COLUMNS).from(factTable).innerJoin(taskTable, eq(taskTable.id, factTable.taskId)).where(and(eq(taskTable.tabId, tabId(at.task.tab)), eq(taskTable.key, at.task.key), or(eq(factTable.state, OPEN), gte(factTable.closedAt, at.at - FOLD_WINDOW_MS)))).orderBy(asc(factTable.firstAt), asc(factTable.id)).all().map((row) => this.factOf(row, at.task));
        const folded = apply(before, ops, at, sweepNow);
        this.persist(run, at.task, before, folded.changed);
        return { changed: folded.changed, refused: folded.refused };
    }
}
