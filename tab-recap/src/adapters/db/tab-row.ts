import type { Database, Statement } from 'bun:sqlite';

export class TabRow {
    private readonly upsert: Statement;

    constructor(db: Database) {
        this.upsert = db.prepare('INSERT INTO tab (id, first_seen, last_seen) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET last_seen = MAX(last_seen, excluded.last_seen)');
    }

    ensure(tab: string, at: number): void {
        this.upsert.run(tab, at, at);
    }
}
