import { existsSync } from 'node:fs';
import type { Fact } from '#src/recap/domain/fact.ts';
import { connectReadOnly } from './connection.ts';
import { LedgerRows } from './ledger-rows.ts';
import { all, text } from './rows.ts';

export function factsOfTab(path: string, tab: string): readonly Fact[] | null {
    if (!existsSync(path)) {
        return null;
    }
    const db = connectReadOnly(path);
    try {
        if (db.prepare("SELECT 1 AS found FROM sqlite_schema WHERE name = 'fact'").get() === undefined) {
            return null;
        }
        const rows = new LedgerRows(db);
        return all(db.prepare('SELECT key FROM task WHERE tab_id = ? ORDER BY key'), tab).flatMap((row) => rows.allOf({ tab, key: text(row, 'key') }));
    } finally {
        db.close();
    }
}
