import type { Database } from 'bun:sqlite';
import { and, asc, count, eq } from 'drizzle-orm';
import { must } from '@stateforge-labs/session-ledger';
import { parseCount, type Count } from '@stateforge-labs/session-ledger';
import type { ScopeId } from '#src/recap/domain/ids.ts';
import { parseText, type Text } from '@stateforge-labs/session-ledger';
import { parseInstant, type Instant } from '@stateforge-labs/session-ledger';
import { parseCompactionTokensRecord, type CompactionTokensRecord, type SessionSourcePort } from '#src/ports/session-source.ts';
import { chapter, compaction, run, tab as tabs } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { guarded } from './rows.ts';

export class SessionSourceStore implements SessionSourcePort {
    private readonly orm: Orm;

    constructor(db: Database) {
        this.orm = ormOf(db);
    }

    firstSeen(tab: ScopeId): Instant | null {
        return guarded((): Instant | null => {
            const seen = this.orm.select({ firstSeen: tabs.firstSeen }).from(tabs).where(eq(tabs.id, tab)).get()?.firstSeen ?? null;
            return seen === null ? null : must(parseInstant(seen));
        }, null);
    }

    runsByCause(tab: ScopeId): Readonly<Record<Text, Count>> {
        return guarded((): Readonly<Record<Text, Count>> => Object.fromEntries(this.orm.select({ cause: run.cause, n: count() }).from(run)
            .innerJoin(chapter, eq(chapter.id, run.chapterId))
            .where(eq(chapter.tabId, tab))
            .groupBy(run.cause).all()
            .map((row): [Text, Count] => [must(parseText(row.cause)), must(parseCount(row.n))])), {});
    }

    compactions(tab: ScopeId): readonly CompactionTokensRecord[] {
        return guarded((): readonly CompactionTokensRecord[] => this.orm.select({ tokensBefore: compaction.tokensBefore, tokensAfter: compaction.tokensAfter, origin: compaction.origin }).from(compaction)
            .where(and(eq(compaction.tabId, tab), eq(compaction.stage, 'compacted')))
            .orderBy(asc(compaction.startedAt), asc(compaction.id)).all()
            .map((row) => must(parseCompactionTokensRecord(row))), []);
    }
}
