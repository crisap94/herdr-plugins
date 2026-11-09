import type { Database } from 'bun:sqlite';
import { and, asc, count, eq } from 'drizzle-orm';
import { originOf } from '#src/recap/domain/origin.ts';
import type { Origin } from '#src/recap/domain/origin.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import type { SessionSource } from '#src/ports/session-source.ts';
import { chapter, compaction, run, tab as tabs } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { guarded } from './rows.ts';

export class SessionSourceRepository implements SessionSource {
    private readonly orm: Orm;

    constructor(db: Database) {
        this.orm = ormOf(db);
    }

    firstSeen(tab: string): number | null {
        return guarded(() => this.orm.select({ firstSeen: tabs.firstSeen }).from(tabs).where(eq(tabs.id, tabId(tab))).get()?.firstSeen ?? null, null);
    }

    runsByCause(tab: string): Readonly<Record<string, number>> {
        return guarded(() => Object.fromEntries(this.orm.select({ cause: run.cause, n: count() }).from(run)
            .innerJoin(chapter, eq(chapter.id, run.chapterId))
            .where(eq(chapter.tabId, tabId(tab)))
            .groupBy(run.cause).all()
            .map((row) => [row.cause, row.n])), {});
    }

    compactions(tab: string): readonly { readonly tokensBefore: number | null; readonly tokensAfter: number | null; readonly origin: Origin }[] {
        return guarded(() => this.orm.select({ tokensBefore: compaction.tokensBefore, tokensAfter: compaction.tokensAfter, origin: compaction.origin }).from(compaction)
            .where(and(eq(compaction.tabId, tabId(tab)), eq(compaction.stage, 'compacted')))
            .orderBy(asc(compaction.startedAt), asc(compaction.id)).all()
            .map((row) => ({ tokensBefore: row.tokensBefore, tokensAfter: row.tokensAfter, origin: originOf(row.origin) })), []);
    }
}
