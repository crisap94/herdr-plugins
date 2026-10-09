// The AskRecords repository: each compaction request tab-recap accepted from another tool, by (tool, id). One row per id, kept across restarts.
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { AskRecords } from '#src/ports/ask-records.ts';
import { guarded, one } from './rows.ts';
import { writeTx } from './connection.ts';

export class AskRepository implements AskRecords {
    private readonly find: StatementSync;
    private readonly insert: StatementSync;
    private readonly drop: StatementSync;
    private readonly db: DatabaseSync;
    private readonly now: () => number;

    constructor(db: DatabaseSync, now: () => number = Date.now) {
        this.db = db;
        this.now = now;
        this.find = db.prepare('SELECT 1 AS found FROM compact_ask WHERE tool = ? AND id = ?');
        this.insert = db.prepare('INSERT OR IGNORE INTO compact_ask (tool, id, pane, at) VALUES (?, ?, ?, ?)');
        this.drop = db.prepare('DELETE FROM compact_ask WHERE at < ?');
    }

    /** A store that cannot be read says the id was seen: nothing is acted on that cannot be recorded. */
    seen(tool: string, id: string): boolean {
        return guarded(() => one(this.find, tool, id) !== null, true);
    }

    remember(tool: string, id: string, pane: string): void {
        writeTx(this.db, () => { this.insert.run(tool, id, pane, this.now()); });
    }

    prune(at: number): void {
        writeTx(this.db, () => { this.drop.run(at); });
    }
}
