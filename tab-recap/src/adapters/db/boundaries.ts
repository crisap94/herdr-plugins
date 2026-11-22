import type { Database } from 'bun:sqlite';
import { and, desc, eq, max, ne, sql } from 'drizzle-orm';
import { chapterStart, compactedFrom } from '#src/recap/domain/boundary.ts';
import type { LaneMark, Planned } from '#src/recap/domain/boundary.ts';
import { paneId, tabId, type TabId } from '#src/recap/domain/ids.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { boundary, chapter, compaction, transcript } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import type { TranscriptMove, TranscriptStore } from './transcripts.ts';
import { ids } from './uuid7.ts';
import { instant } from '#src/recap/domain/time.ts';
import { countOf } from '#src/recap/domain/count.ts';

export interface Found {
    readonly at: Instant;
    readonly marks: readonly LaneMark[];
    readonly moved: readonly TranscriptMove[];
}

interface Row extends Planned {
    readonly transcript: Uint8Array;
    readonly replaces: Uint8Array | null;
}

type Ordering = -1 | 0 | 1;

const byTime = (a: Row, b: Row): Ordering => {
    if (a.at === b.at) {
        return 0;
    }
    return a.at < b.at ? -1 : 1;
};

export class BoundaryRows {
    private readonly transcripts: TranscriptStore;
    private readonly orm: Orm;

    constructor(db: Database, transcripts: TranscriptStore) {
        this.transcripts = transcripts;
        this.orm = ormOf(db);
    }

    private compacted(tab: TabId, found: Found): readonly Row[] {
        return [...new Set(found.marks.map((mark) => mark.pane))].flatMap((pane) => {
            const last = this.orm.select({ at: max(boundary.at) }).from(boundary)
                .innerJoin(transcript, eq(transcript.id, boundary.transcriptId))
                .where(and(eq(boundary.kind, 'compacted'), eq(transcript.tabId, tabId(tab)), eq(transcript.pane, paneId(pane)))).get()?.at ?? null;
            const asked = this.orm.select({ startedAt: compaction.startedAt }).from(compaction)
                .where(and(eq(compaction.tabId, tabId(tab)), eq(compaction.pane, paneId(pane)), ne(compaction.stage, 'skipped'))).all()
                .map((row) => instant(row.startedAt));
            const planned = compactedFrom(found.marks.filter((mark) => mark.pane === pane), last === null ? null : instant(last), asked);
            return planned.map((each) => Object.assign({}, each, { transcript: this.transcripts.ofPane(tab, paneId(pane), found.at), replaces: null }));
        });
    }

    private switched(found: Found): readonly Row[] {
        return found.moved.flatMap((moved) => (moved.replaces === null ? [] : [{
            kind: 'switched' as const, pane: moved.pane, at: found.at, trigger: null, cursor: countOf(moved.to),
            tokensBefore: null, tokensAfter: null, tookMs: null, transcript: moved.id, replaces: moved.replaces,
        }]));
    }

    private open(tab: TabId, row: Row): void {
        const sealed = this.orm.select({ n: chapter.n, startedAt: chapter.startedAt }).from(chapter)
            .where(eq(chapter.tabId, tabId(tab))).orderBy(desc(chapter.n)).limit(1).get();
        const chapterRow = ids.next();
        this.orm.insert(chapter).values({
            id: chapterRow, tabId: tabId(tab), n: (sealed?.n ?? 1) + 1, startedAt: chapterStart(row.at, instant(sealed?.startedAt ?? row.at)),
        }).run();
        this.orm.insert(boundary).values({
            id: ids.next(), chapterId: chapterRow, transcriptId: row.transcript, kind: row.kind, at: row.at, trigger: row.trigger, cursor: row.cursor,
            replacesId: row.replaces, tokensBefore: row.tokensBefore, tokensAfter: row.tokensAfter, tookMs: row.tookMs,
        }).run();
    }

    record(tab: TabId, found: Found): void {
        this.orm.insert(chapter).values({ id: ids.next(), tabId: tabId(tab), n: 1, startedAt: found.at }).onConflictDoNothing().run();
        for (const row of [...this.compacted(tab, found), ...this.switched(found)].toSorted(byTime)) {
            this.open(tab, row);
        }
        this.orm.run(sql`UPDATE compaction SET boundary_id = (
            SELECT b.id FROM boundary b JOIN transcript t ON t.id = b.transcript_id
            WHERE b.kind = 'compacted' AND b.trigger = 'plugin' AND t.tab_id = compaction.tab_id AND t.pane = compaction.pane
              AND b.at >= compaction.started_at AND b.at - compaction.started_at <= 600000
              AND NOT EXISTS (SELECT 1 FROM compaction other WHERE other.boundary_id = b.id)
            ORDER BY b.at LIMIT 1)
          WHERE tab_id = ${tab} AND boundary_id IS NULL AND stage IN ('compacting','restoring','compacted')`);
    }
}
