// Retention: a tab nobody has seen for a while goes, with everything that hangs off it (the foreign keys cascade).
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { Removed, Retention } from '#src/ports/retention.ts';
import { writeTx } from './connection.ts';
import { all, one, text, whole } from './rows.ts';

const count = (db: DatabaseSync, sql: string): StatementSync => db.prepare(sql);

export class RetentionRepository implements Retention {
    private readonly db: DatabaseSync;
    private readonly old: StatementSync;
    private readonly runs: StatementSync;
    private readonly chapters: StatementSync;
    private readonly boundaries: StatementSync;
    private readonly compactions: StatementSync;
    private readonly facts: StatementSync | null;
    private readonly drop: StatementSync;
    private readonly visibility: StatementSync;

    constructor(db: DatabaseSync) {
        this.db = db;
        // seen = the newest of its last run and the last time the daemon drew its column
        this.old = db.prepare('SELECT id FROM tab WHERE column_pane IS NULL AND MAX(last_seen, COALESCE(view_at, 0)) < ? ORDER BY id');
        this.runs = count(db, 'SELECT COUNT(*) AS n FROM run r JOIN chapter c ON c.id = r.chapter_id WHERE c.tab_id = ?');
        this.chapters = count(db, 'SELECT COUNT(*) AS n FROM chapter WHERE tab_id = ?');
        this.boundaries = count(db, 'SELECT COUNT(*) AS n FROM boundary b JOIN chapter c ON c.id = b.chapter_id WHERE c.tab_id = ?');
        this.compactions = count(db, 'SELECT COUNT(*) AS n FROM compaction WHERE tab_id = ?');
        const ledger = one(db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'fact'"));
        this.facts = ledger === null ? null : count(db, 'SELECT COUNT(*) AS n FROM fact WHERE tab_id = ?');
        this.drop = db.prepare('DELETE FROM tab WHERE id = ?');
        this.visibility = db.prepare('DELETE FROM tab_visibility WHERE tab_id = ?');
    }

    expired(cutoff: number): readonly string[] {
        return all(this.old, cutoff).map((row) => text(row, 'id'));
    }

    remove(tab: string): Removed {
        const n = (statement: StatementSync): number => whole(one(statement, tab) ?? { n: 0 }, 'n');
        return writeTx(this.db, () => {
            const removed = { runs: n(this.runs), chapters: n(this.chapters), boundaries: n(this.boundaries), compactions: n(this.compactions), facts: this.facts === null ? 0 : n(this.facts) };
            this.visibility.run(tab);
            this.drop.run(tab);
            return removed;
        });
    }
}
