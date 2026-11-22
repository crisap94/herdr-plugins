import { existsSync } from 'node:fs';
import type { Fact } from '#src/recap/domain/fact.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import { connectReadOnly } from './connection.ts';
import { LedgerRows } from './ledger-rows.ts';
import { all, text } from './rows.ts';
import { textOf } from '#src/recap/domain/text.ts';

export { factsOfTab } from './legacy.ts';

export function factsOfTabAt(path: FsPath, tab: TabId): readonly Fact[] | null {
    if (!existsSync(path)) {
        return null;
    }
    const db = connectReadOnly(path);
    try {
        if (db.prepare("SELECT 1 AS found FROM sqlite_schema WHERE name = 'fact'").get() === null) {
            return null;
        }
        const rows = new LedgerRows(db);
        return all(db.prepare('SELECT key FROM task WHERE tab_id = ? ORDER BY key'), tab).flatMap((row) => rows.allOf({ tab, key: textOf(text(row, 'key')) }));
    } finally {
        db.close();
    }
}
