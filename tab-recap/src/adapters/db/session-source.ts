import type { Database } from 'bun:sqlite';
import { and, asc, count, eq } from 'drizzle-orm';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { originOf } from '#src/recap/domain/origin.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { must } from '#src/protocol/result.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import type { CompactionTokens, SessionSource } from '#src/ports/session-source.ts';
import { chapter, compaction, run, tab as tabs } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { guarded } from './rows.ts';

const countOrNull = (value: number | null): Count | null => (value === null ? null : must(parseCount(value)));

export class SessionSourceRepository implements SessionSource {
    private readonly orm: Orm;

    constructor(db: Database) {
        this.orm = ormOf(db);
    }

    firstSeen(tab: TabId): Instant | null {
        return guarded((): Instant | null => {
            const seen = this.orm.select({ firstSeen: tabs.firstSeen }).from(tabs).where(eq(tabs.id, tab)).get()?.firstSeen ?? null;
            return seen === null ? null : instant(seen);
        }, null);
    }

    runsByCause(tab: TabId): Readonly<Record<Text, Count>> {
        return guarded((): Readonly<Record<Text, Count>> => Object.fromEntries(this.orm.select({ cause: run.cause, n: count() }).from(run)
            .innerJoin(chapter, eq(chapter.id, run.chapterId))
            .where(eq(chapter.tabId, tab))
            .groupBy(run.cause).all()
            .map((row): [Text, Count] => [must(parseText(row.cause)), must(parseCount(row.n))])), {});
    }

    compactions(tab: TabId): readonly CompactionTokens[] {
        return guarded((): readonly CompactionTokens[] => this.orm.select({ tokensBefore: compaction.tokensBefore, tokensAfter: compaction.tokensAfter, origin: compaction.origin }).from(compaction)
            .where(and(eq(compaction.tabId, tab), eq(compaction.stage, 'compacted')))
            .orderBy(asc(compaction.startedAt), asc(compaction.id)).all()
            .map((row): CompactionTokens => ({ tokensBefore: countOrNull(row.tokensBefore), tokensAfter: countOrNull(row.tokensAfter), origin: originOf(row.origin) })), []);
    }
}
