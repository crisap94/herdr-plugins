import type { Database } from 'bun:sqlite';
import { lt, sql } from 'drizzle-orm';
import type { AutocompactBriefs } from '#src/ports/autocompact-briefs.ts';
import type { CheckedFact } from '#src/recap/domain/autocompact.ts';
import { encode } from './checked-fact-codec.ts';
import { autocompactBrief } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { idOf } from './typeid.ts';
import { writeTx } from './connection.ts';

export class AutocompactBriefsRepository implements AutocompactBriefs {
    private readonly db: Database;
    private readonly orm: Orm;

    constructor(db: Database) {
        this.db = db;
        this.orm = ormOf(db);
    }

    put(decisionId: string, brief: string, appended: readonly number[], checked: readonly CheckedFact[], briefedAt: number): void {
        const id = idOf('decision', decisionId);
        if (id !== null) {
            writeTx(this.db, () => {
                this.orm.insert(autocompactBrief).values({ decisionId: id, briefedAt, body: encode({ brief, appended, checked }) })
                    .onConflictDoUpdate({ target: autocompactBrief.decisionId, set: { briefedAt: sql`excluded.briefed_at`, body: sql`excluded.body` } })
                    .run();
            });
        }
    }

    clearBefore(cutoff: number): number {
        return writeTx(this.db, () => this.orm.delete(autocompactBrief).where(lt(autocompactBrief.briefedAt, cutoff)).returning({ id: autocompactBrief.decisionId }).all().length);
    }
}
