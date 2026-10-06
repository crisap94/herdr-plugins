import type { DatabaseSync, StatementSync } from 'node:sqlite';

/** Every aggregate hangs off a tab: make sure its row exists, and remember when it was last touched (retention reads this). */
export class TabRow {
    private readonly upsert: StatementSync;

    constructor(db: DatabaseSync) {
        this.upsert = db.prepare('INSERT INTO tab (id, first_seen, last_seen) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET last_seen = MAX(last_seen, excluded.last_seen)');
    }

    ensure(tab: string, at: number): void {
        this.upsert.run(tab, at, at);
    }
}
