// The Boundaries repository: queries only.
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { Boundaries, Break } from '#src/ports/boundaries.ts';
import type { BoundaryKind, Trigger } from '#src/recap/domain/boundary.ts';
import { all, guarded, maybeText, maybeWhole, one, text, whole } from './rows.ts';
import type { Row } from './rows.ts';

const breakOf = (row: Row): Break => ({
    kind: text(row, 'kind') as BoundaryKind, at: whole(row, 'at'), trigger: maybeText(row, 'trigger') as Trigger | null,
    tokensBefore: maybeWhole(row, 'tokens_before'), tokensAfter: maybeWhole(row, 'tokens_after'), tookMs: maybeWhole(row, 'took_ms'),
});

export class BoundaryRepository implements Boundaries {
    private readonly breaks: StatementSync;
    private readonly count: StatementSync;
    private readonly last: StatementSync;

    constructor(db: DatabaseSync) {
        this.breaks = db.prepare(`SELECT b.kind, b.at, b.trigger,
            COALESCE(b.tokens_before, c.tokens_before) AS tokens_before, COALESCE(b.tokens_after, c.tokens_after) AS tokens_after, COALESCE(b.took_ms, c.took_ms) AS took_ms
          FROM boundary b JOIN chapter ch ON ch.id = b.chapter_id LEFT JOIN compaction c ON c.boundary_id = b.id
          WHERE ch.tab_id = ? ORDER BY b.at, ch.n`);
        this.count = db.prepare('SELECT COUNT(*) AS n FROM chapter WHERE tab_id = ?');
        this.last = db.prepare('SELECT MAX(b.at) AS at FROM boundary b JOIN transcript t ON t.id = b.transcript_id WHERE t.tab_id = ? AND t.pane = ?');
    }

    breaksOf(tab: string): readonly Break[] {
        return guarded(() => all(this.breaks, tab).map(breakOf), []);
    }

    chapterCount(tab: string): number {
        return guarded(() => whole(one(this.count, tab) ?? { n: 0 }, 'n'), 0);
    }

    lastBreakAt(tab: string, pane: string): number | null {
        return guarded(() => maybeWhole(one(this.last, tab, pane) ?? { at: null }, 'at'), null);
    }
}
