import { uncheckedTypeId } from '#src/recap/domain/type-id.ts';
import type { Database } from 'bun:sqlite';
import { lt, sql } from 'drizzle-orm';
import type { DecisionBriefs } from '#src/ports/autocompact-briefs.ts';
import { must } from '@stateforge-labs/session-ledger';
import type { CheckedFact } from '@stateforge-labs/session-ledger';
import { parseCount, type Count } from '@stateforge-labs/session-ledger';
import type { FactIndex } from '#src/recap/domain/fact-index.ts';
import type { DecisionId } from '#src/recap/domain/ids.ts';
import type { Text } from '@stateforge-labs/session-ledger';
import type { Instant } from '@stateforge-labs/session-ledger';
import { encode } from './checked-fact-codec.ts';
import { autocompactBrief } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { idOf } from './typeid.ts';
import { writeTransaction } from '@stateforge-labs/session-ledger-sqlite/unstable/connection.ts';

export class DecisionBriefsRepository implements DecisionBriefs {
    private readonly db: Database;
    private readonly orm: Orm;

    constructor(db: Database) {
        this.db = db;
        this.orm = ormOf(db);
    }

    put(decisionId: DecisionId, brief: Text, appended: readonly FactIndex[], checked: readonly CheckedFact[], briefedAt: Instant): void {
        const id = idOf('decision', uncheckedTypeId(decisionId));
        if (id !== null) {
            writeTransaction(this.db, () => {
                this.orm.insert(autocompactBrief).values({ decisionId: id, briefedAt, body: encode({ brief, appended, checked }) })
                    .onConflictDoUpdate({ target: autocompactBrief.decisionId, set: { briefedAt: sql`excluded.briefed_at`, body: sql`excluded.body` } })
                    .run();
            });
        }
    }

    clearBefore(cutoff: Instant): Count {
        return writeTransaction(this.db, () => must(parseCount(this.orm.delete(autocompactBrief).where(lt(autocompactBrief.briefedAt, cutoff)).returning({ id: autocompactBrief.decisionId }).all().length)));
    }
}
