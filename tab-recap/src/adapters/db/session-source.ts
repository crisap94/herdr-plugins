import type { Database } from 'bun:sqlite';
import { and, asc, count, eq } from 'drizzle-orm';
import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { type TabId, parseTabId } from '#src/recap/domain/ids.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { parseInstant, type Instant } from '#src/recap/domain/time.ts';
import { parseCompactionTokensRecord, type CompactionTokensRecord, type SessionSourcePort, type CompactionTokens, type SessionSource } from '#src/ports/session-source.ts';
import { chapter, compaction, run, tab as tabs } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { guarded } from './rows.ts';

export class SessionSourceStore implements SessionSourcePort {
    private readonly orm: Orm;

    constructor(db: Database) {
        this.orm = ormOf(db);
    }

    firstSeen(tab: TabId): Instant | null {
        return guarded((): Instant | null => {
            const seen = this.orm.select({ firstSeen: tabs.firstSeen }).from(tabs).where(eq(tabs.id, tab)).get()?.firstSeen ?? null;
            return seen === null ? null : must(parseInstant(seen));
        }, null);
    }

    runsByCause(tab: TabId): Readonly<Record<Text, Count>> {
        return guarded((): Readonly<Record<Text, Count>> => Object.fromEntries(this.orm.select({ cause: run.cause, n: count() }).from(run)
            .innerJoin(chapter, eq(chapter.id, run.chapterId))
            .where(eq(chapter.tabId, tab))
            .groupBy(run.cause).all()
            .map((row): [Text, Count] => [must(parseText(row.cause)), must(parseCount(row.n))])), {});
    }

    compactions(tab: TabId): readonly CompactionTokensRecord[] {
        return guarded((): readonly CompactionTokensRecord[] => this.orm.select({ tokensBefore: compaction.tokensBefore, tokensAfter: compaction.tokensAfter, origin: compaction.origin }).from(compaction)
            .where(and(eq(compaction.tabId, tab), eq(compaction.stage, 'compacted')))
            .orderBy(asc(compaction.startedAt), asc(compaction.id)).all()
            .map((row) => must(parseCompactionTokensRecord(row))), []);
    }
}

export class SessionSourceRepository implements SessionSource {
    private readonly store: SessionSourceStore;

    constructor(db: Database) {
        this.store = new SessionSourceStore(db);
    }

    firstSeen(tab: string): number | null {
        const id = parseTabId(tab);
        return id.kind === 'ok' ? this.store.firstSeen(id.value) : null;
    }

    runsByCause(tab: string): Readonly<Record<string, number>> {
        const id = parseTabId(tab);
        return id.kind === 'ok' ? this.store.runsByCause(id.value) : {};
    }

    compactions(tab: string): readonly CompactionTokens[] {
        const id = parseTabId(tab);
        return id.kind === 'ok' ? this.store.compactions(id.value) : [];
    }
}
