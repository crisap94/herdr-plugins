import type { Database } from 'bun:sqlite';
import { and, asc, count, eq, max, sql } from 'drizzle-orm';
import type { BoundaryBreak, BoundaryLog } from '#src/ports/boundaries.ts';
import { must } from '#src/protocol/result.ts';
import type { BoundaryKind, Trigger } from '#src/recap/domain/boundary.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import type { SessionKey, ScopeId } from '#src/recap/domain/ids.ts';
import { duration, instant, type Instant } from '#src/recap/domain/time.ts';
import { boundary, chapter, compaction, transcript } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { guarded } from './rows.ts';

const KINDS: readonly BoundaryKind[] = ['compacted', 'switched'];
const TRIGGERS: readonly Trigger[] = ['auto', 'manual', 'plugin'];
const NONE = must(parseCount(0));

export class BoundaryLogRepository implements BoundaryLog {
    private readonly orm: Orm;

    constructor(db: Database) {
        this.orm = ormOf(db);
    }

    breaksOf(tab: ScopeId): readonly BoundaryBreak[] {
        return guarded((): readonly BoundaryBreak[] => this.orm.select({
            kind: boundary.kind,
            at: boundary.at,
            trigger: boundary.trigger,
            tokensBefore: sql<number | null>`COALESCE(${boundary.tokensBefore}, ${compaction.tokensBefore})`,
            tokensAfter: sql<number | null>`COALESCE(${boundary.tokensAfter}, ${compaction.tokensAfter})`,
            took: sql<number | null>`COALESCE(${boundary.tookMs}, ${compaction.tookMs})`,
        }).from(boundary)
            .innerJoin(chapter, eq(chapter.id, boundary.chapterId))
            .leftJoin(compaction, eq(compaction.boundaryId, boundary.id))
            .where(eq(chapter.tabId, tab))
            .orderBy(asc(boundary.at), asc(chapter.n))
            .all()
            .flatMap((row) => {
                const kind = KINDS.find((each) => each === row.kind);
                const trigger = row.trigger === null ? null : TRIGGERS.find((each) => each === row.trigger);
                if (kind === undefined || trigger === undefined) return [];
                return [{
                    kind, at: instant(row.at), trigger,
                    tokensBefore: row.tokensBefore === null ? null : must(parseCount(row.tokensBefore)),
                    tokensAfter: row.tokensAfter === null ? null : must(parseCount(row.tokensAfter)),
                    took: row.took === null ? null : duration(row.took),
                }];
            }), []);
    }

    chapterCount(tab: ScopeId): Count {
        return guarded(() => must(parseCount(this.orm.select({ n: count() }).from(chapter).where(eq(chapter.tabId, tab)).get()?.n ?? 0)), NONE);
    }

    lastBreakAt(tab: ScopeId, pane: SessionKey): Instant | null {
        return guarded(() => {
            const at = this.orm.select({ at: max(boundary.at) }).from(boundary)
                .innerJoin(transcript, eq(transcript.id, boundary.transcriptId))
                .where(and(eq(transcript.tabId, tab), eq(transcript.pane, pane))).get()?.at ?? null;
            return at === null ? null : instant(at);
        }, null);
    }
}
