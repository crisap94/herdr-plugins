import type { DatabaseSync, StatementSync } from 'node:sqlite';
import { chapterStart, compactedFrom } from '#src/recap/domain/boundary.ts';
import type { LaneMark, Planned } from '#src/recap/domain/boundary.ts';
import { all, maybeWhole, one, whole } from './rows.ts';
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
    private readonly first: StatementSync;
    private readonly latest: StatementSync;
    private readonly chapter: StatementSync;
    private readonly boundary: StatementSync;
    private readonly lastCompacted: StatementSync;
    private readonly askedAt: StatementSync;
    private readonly link: StatementSync;

    constructor(db: DatabaseSync, transcripts: TranscriptRows) {
        this.transcripts = transcripts;
        this.first = db.prepare('INSERT OR IGNORE INTO chapter (id, tab_id, n, started_at) VALUES (?, ?, 1, ?)');
        this.latest = db.prepare('SELECT n, started_at FROM chapter WHERE tab_id = ? ORDER BY n DESC LIMIT 1');
        this.chapter = db.prepare('INSERT INTO chapter (id, tab_id, n, started_at) VALUES (?, ?, ?, ?)');
        this.boundary = db.prepare(`INSERT INTO boundary (id, chapter_id, transcript_id, kind, at, trigger, cursor, replaces_id, tokens_before, tokens_after, took_ms)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        this.lastCompacted = db.prepare("SELECT MAX(b.at) AS at FROM boundary b JOIN transcript t ON t.id = b.transcript_id WHERE b.kind = 'compacted' AND t.tab_id = ? AND t.pane = ?");
        this.askedAt = db.prepare("SELECT started_at FROM compaction WHERE tab_id = ? AND pane = ? AND stage <> 'skipped'");
        this.link = db.prepare(`UPDATE compaction SET boundary_id = (
            SELECT b.id FROM boundary b JOIN transcript t ON t.id = b.transcript_id
            WHERE b.kind = 'compacted' AND b.trigger = 'plugin' AND t.tab_id = compaction.tab_id AND t.pane = compaction.pane
              AND b.at >= compaction.started_at AND b.at - compaction.started_at <= 600000
              AND NOT EXISTS (SELECT 1 FROM compaction other WHERE other.boundary_id = b.id)
            ORDER BY b.at LIMIT 1)
          WHERE tab_id = ? AND boundary_id IS NULL AND stage IN ('compacting','restoring','compacted')`);
    }

    private compacted(tab: string, found: Found): readonly Row[] {
        return [...new Set(found.marks.map((mark) => mark.pane))].flatMap((pane) => {
            const last = maybeWhole(one(this.lastCompacted, tab, pane) ?? { at: null }, 'at');
            const asked = all(this.askedAt, tab, pane).map((row) => whole(row, 'started_at'));
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
        const sealed = one(this.latest, tab) ?? { n: 1, started_at: row.at };
        const chapter = ids.next();
        this.chapter.run(chapter, tab, whole(sealed, 'n') + 1, chapterStart(row.at, whole(sealed, 'started_at')));
        this.boundary.run(ids.next(), chapter, row.transcript, row.kind, row.at, row.trigger, row.cursor, row.replaces, row.tokensBefore, row.tokensAfter, row.tookMs);
    }

    record(tab: string, found: Found): void {
        this.first.run(ids.next(), tab, found.at);
        for (const row of [...this.compacted(tab, found), ...this.switched(found)].toSorted((a, b) => a.at - b.at)) {
            this.open(tab, row);
        }
        this.link.run(tab);
    }
}
