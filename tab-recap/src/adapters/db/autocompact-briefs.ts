import type { Database, Statement } from 'bun:sqlite';
import type { AutocompactBriefs } from '#src/ports/autocompact-briefs.ts';
import type { CheckedFact } from '#src/recap/domain/autocompact.ts';
import { encode } from './checked-fact-codec.ts';
import { idOf } from './typeid.ts';
import { writeTx } from './connection.ts';

export class AutocompactBriefsRepository implements AutocompactBriefs {
    private readonly db: Database;
    private readonly insert: Statement;
    private readonly clear: Statement;

    constructor(db: Database) {
        this.db = db;
        this.insert = db.prepare('INSERT INTO autocompact_brief (decision_id, briefed_at, body) VALUES (?, ?, ?) ON CONFLICT (decision_id) DO UPDATE SET briefed_at = excluded.briefed_at, body = excluded.body');
        this.clear = db.prepare('DELETE FROM autocompact_brief WHERE briefed_at < ?');
    }

    put(decisionId: string, brief: string, appended: readonly number[], checked: readonly CheckedFact[], briefedAt: number): void {
        const id = idOf('decision', decisionId);
        if (id !== null) writeTx(this.db, () => { this.insert.run(id, briefedAt, encode({ brief, appended, checked })); });
    }

    clearBefore(cutoff: number): number {
        return writeTx(this.db, () => this.clear.run(cutoff).changes);
    }
}
