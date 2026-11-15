import type { Database } from 'bun:sqlite';
import { sql } from 'drizzle-orm';
import { tab as tabs } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { tabId } from '#src/recap/domain/ids.ts';

export class TabRow {
    private readonly orm: Orm;

    constructor(db: Database) {
        this.orm = ormOf(db);
    }

    ensure(tab: string, at: number): void {
        this.orm.insert(tabs).values({ id: tabId(tab), firstSeen: at, lastSeen: at, running: 0 })
            .onConflictDoUpdate({ target: tabs.id, set: { lastSeen: sql`MAX(${tabs.lastSeen}, excluded.last_seen)` } })
            .run();
    }
}
