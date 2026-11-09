import type { Database } from 'bun:sqlite';
import { and, asc, count, eq, isNull, lt, sql } from 'drizzle-orm';
import type { Removed, Retention } from '#src/ports/retention.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import { writeTx } from './connection.ts';
import { boundary, chapter, compaction, fact, run, tab as tabs, tabVisibility } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { one } from './rows.ts';

export class RetentionRepository implements Retention {
    private readonly db: Database;
    private readonly orm: Orm;
    private readonly hasFacts: boolean;

    constructor(db: Database) {
        this.db = db;
        this.orm = ormOf(db);
        this.hasFacts = one(db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'fact'")) !== null;
    }

    expired(cutoff: number, protectedTabs: readonly TabId[]): readonly TabId[] {
        const kept = new Set<string>(protectedTabs);
        return this.orm.select({ id: tabs.id }).from(tabs)
            .where(and(isNull(tabs.columnPane), lt(sql`max(${tabs.lastSeen}, coalesce(${tabs.viewAt}, 0))`, cutoff)))
            .orderBy(asc(tabs.id)).all()
            .map((row) => tabId(row.id))
            .filter((tab) => !kept.has(tab));
    }

    remove(tab: string): Removed {
        const id = tabId(tab);
        return writeTx(this.db, () => {
            const removed = this.sizeOf(id);
            this.orm.delete(tabVisibility).where(eq(tabVisibility.tabId, id)).run();
            this.orm.delete(tabs).where(eq(tabs.id, id)).run();
            return removed;
        });
    }

    private sizeOf(id: TabId): Removed {
        return {
            runs: this.orm.select({ n: count() }).from(run).innerJoin(chapter, eq(chapter.id, run.chapterId)).where(eq(chapter.tabId, id)).get()?.n ?? 0,
            chapters: this.orm.select({ n: count() }).from(chapter).where(eq(chapter.tabId, id)).get()?.n ?? 0,
            boundaries: this.orm.select({ n: count() }).from(boundary).innerJoin(chapter, eq(chapter.id, boundary.chapterId)).where(eq(chapter.tabId, id)).get()?.n ?? 0,
            compactions: this.orm.select({ n: count() }).from(compaction).where(eq(compaction.tabId, id)).get()?.n ?? 0,
            facts: this.factsOf(id),
        };
    }

    private factsOf(id: TabId): number {
        return this.hasFacts ? this.orm.select({ n: count() }).from(fact).where(eq(fact.tabId, id)).get()?.n ?? 0 : 0;
    }
}
