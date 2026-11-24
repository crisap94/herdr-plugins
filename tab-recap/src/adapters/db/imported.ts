import { existsSync } from 'node:fs';
import type { Fact } from '@stateforge-labs/session-ledger';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import type { ScopeId } from '#src/recap/domain/ids.ts';
import { connectReadOnly } from '@stateforge-labs/session-ledger-sqlite/unstable/connection.ts';
import { LedgerRows } from './ledger-rows.ts';
import { all, text } from './rows.ts';
import { textOf } from '@stateforge-labs/session-ledger';

export function factsOfTabAt(path: FsPath, tab: ScopeId): readonly Fact[] | null {
    if (!existsSync(path)) {
        return null;
    }
    const db = connectReadOnly(path);
    try {
        if (db.prepare("SELECT 1 AS found FROM sqlite_schema WHERE name = 'fact'").get() === null) {
            return null;
        }
        const rows = new LedgerRows(db);
        return all(db.prepare('SELECT key FROM task WHERE tab_id = ? ORDER BY key'), tab).flatMap((row) => rows.allOf({ scope: tab, key: textOf(text(row, 'key')) }));
    } finally {
        db.close();
    }
}
