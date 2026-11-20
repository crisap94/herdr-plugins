import type { Database } from 'bun:sqlite';
import { sql } from 'drizzle-orm';
import type { TabId } from '#src/recap/domain/ids.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { tab as tabs } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';

export class TabStore {
    private readonly orm: Orm;

    constructor(db: Database) {
        this.orm = ormOf(db);
    }

    ensure(tab: TabId, at: Instant): void {
        this.orm.insert(tabs).values({ id: tab, firstSeen: at, lastSeen: at, running: 0 })
            .onConflictDoUpdate({ target: tabs.id, set: { lastSeen: sql`MAX(${tabs.lastSeen}, excluded.last_seen)` } })
            .run();
    }
}
