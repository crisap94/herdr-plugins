import type { Database } from 'bun:sqlite';
import { and, desc, eq, max, ne, sql } from 'drizzle-orm';
import { chapterStart, compactedFrom } from '#src/recap/domain/boundary.ts';
import type { LaneMark, Planned } from '#src/recap/domain/boundary.ts';
import { paneId, tabId } from '#src/recap/domain/ids.ts';
import { boundary, chapter, compaction, transcript } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import type { Moved, TranscriptRows } from './transcripts.ts';
import { ids } from './uuid7.ts';

export interface Found {
    readonly at: number;
    readonly marks: readonly LaneMark[];
    readonly moved: readonly Moved[];
}

interface Row extends Planned {
    readonly transcript: Uint8Array;
    readonly replaces: Uint8Array | null;
}

export class BoundaryRows {
    private readonly transcripts: TranscriptRows;
    private readonly orm: Orm;

    constructor(db: Database, transcripts: TranscriptRows) {
        this.transcripts = transcripts;
        this.orm = ormOf(db);
    }

    private compacted(tab: string, found: Found): readonly Row[] {
        return [...new Set(found.marks.map((mark) => mark.pane))].flatMap((pane) => {
            const last = this.orm.select({ at: max(boundary.at) }).from(boundary)
                .innerJoin(transcript, eq(transcript.id, boundary.transcriptId))
                .where(and(eq(boundary.kind, 'compacted'), eq(transcript.tabId, tabId(tab)), eq(transcript.pane, paneId(pane)))).get()?.at ?? null;
            const asked = this.orm.select({ startedAt: compaction.startedAt }).from(compaction)
                .where(and(eq(compaction.tabId, tabId(tab)), eq(compaction.pane, paneId(pane)), ne(compaction.stage, 'skipped'))).all()
                .map((row) => row.startedAt);
            const planned = compactedFrom(found.marks.filter((mark) => mark.pane === pane), last, asked);
            return planned.map((each) => Object.assign({}, each, { transcript: this.transcripts.ofPane(tab, pane, found.at), replaces: null }));
        });
    }

    private switched(found: Found): readonly Row[] {
        return found.moved.flatMap((moved) => (moved.replaces === null ? [] : [{
            kind: 'switched' as const, pane: moved.pane, at: found.at, trigger: null, cursor: moved.to,
            tokensBefore: null, tokensAfter: null, tookMs: null, transcript: moved.id, replaces: moved.replaces,
        }]));
    }

    private open(tab: string, row: Row): void {
        const sealed = this.orm.select({ n: chapter.n, startedAt: chapter.startedAt }).from(chapter)
            .where(eq(chapter.tabId, tabId(tab))).orderBy(desc(chapter.n)).limit(1).get();
        const chapterRow = ids.next();
        this.orm.insert(chapter).values({
            id: chapterRow, tabId: tabId(tab), n: (sealed?.n ?? 1) + 1, startedAt: chapterStart(row.at, sealed?.startedAt ?? row.at),
        }).run();
        this.orm.insert(boundary).values({
            id: ids.next(), chapterId: chapterRow, transcriptId: row.transcript, kind: row.kind, at: row.at, trigger: row.trigger, cursor: row.cursor,
            replacesId: row.replaces, tokensBefore: row.tokensBefore, tokensAfter: row.tokensAfter, tookMs: row.tookMs,
        }).run();
    }

    record(tab: string, found: Found): void {
        this.orm.insert(chapter).values({ id: ids.next(), tabId: tabId(tab), n: 1, startedAt: found.at }).onConflictDoNothing().run();
        for (const row of [...this.compacted(tab, found), ...this.switched(found)].toSorted((a, b) => a.at - b.at)) {
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
