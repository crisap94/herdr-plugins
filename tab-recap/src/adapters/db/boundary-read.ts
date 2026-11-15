import type { Database } from 'bun:sqlite';
import { and, asc, count, eq, max, sql } from 'drizzle-orm';
import type { Boundaries, Break } from '#src/ports/boundaries.ts';
import type { BoundaryKind, Trigger } from '#src/recap/domain/boundary.ts';
import { paneId, tabId } from '#src/recap/domain/ids.ts';
import { boundary, chapter, compaction, transcript } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { guarded } from './rows.ts';

export class BoundaryRepository implements Boundaries {
    private readonly orm: Orm;

    constructor(db: Database) {
        this.orm = ormOf(db);
    }

    breaksOf(tab: string): readonly Break[] {
        return guarded(() => this.orm.select({
            kind: boundary.kind,
            at: boundary.at,
            trigger: boundary.trigger,
            tokensBefore: sql<number | null>`COALESCE(${boundary.tokensBefore}, ${compaction.tokensBefore})`,
            tokensAfter: sql<number | null>`COALESCE(${boundary.tokensAfter}, ${compaction.tokensAfter})`,
            tookMs: sql<number | null>`COALESCE(${boundary.tookMs}, ${compaction.tookMs})`,
        }).from(boundary)
            .innerJoin(chapter, eq(chapter.id, boundary.chapterId))
            .leftJoin(compaction, eq(compaction.boundaryId, boundary.id))
            .where(eq(chapter.tabId, tabId(tab)))
            .orderBy(asc(boundary.at), asc(chapter.n))
            .all()
            .map((row): Break => ({
                kind: row.kind as BoundaryKind, at: row.at, trigger: row.trigger as Trigger | null,
                tokensBefore: row.tokensBefore, tokensAfter: row.tokensAfter, tookMs: row.tookMs,
            })), []);
    }

    chapterCount(tab: string): number {
        return guarded(() => this.orm.select({ n: count() }).from(chapter).where(eq(chapter.tabId, tabId(tab))).get()?.n ?? 0, 0);
    }

    lastBreakAt(tab: string, pane: string): number | null {
        return guarded(() => this.orm.select({ at: max(boundary.at) }).from(boundary)
            .innerJoin(transcript, eq(transcript.id, boundary.transcriptId))
            .where(and(eq(transcript.tabId, tabId(tab)), eq(transcript.pane, paneId(pane)))).get()?.at ?? null, null);
    }
}
