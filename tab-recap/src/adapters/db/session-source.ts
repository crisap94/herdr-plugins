// The SessionSource repository: what the store knows of a tab's session — when it began, how many runs of each cause, the compactions.
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { SessionSource } from '#src/ports/session-source.ts';
import { all, guarded, maybeWhole, one, text, whole } from './rows.ts';

export class SessionSourceRepository implements SessionSource {
    private readonly first: StatementSync;
    private readonly runs: StatementSync;
    private readonly compacted: StatementSync;

    constructor(db: DatabaseSync) {
        this.first = db.prepare('SELECT first_seen FROM tab WHERE id = ?');
        this.runs = db.prepare('SELECT run.cause AS cause, count(*) AS n FROM run JOIN chapter ON chapter.id = run.chapter_id WHERE chapter.tab_id = ? GROUP BY run.cause');
        this.compacted = db.prepare("SELECT tokens_before, tokens_after, origin FROM compaction WHERE tab_id = ? AND stage = 'compacted' ORDER BY started_at, id");
    }

    firstSeen(tab: string): number | null {
        return guarded(() => {
            const row = one(this.first, tab);
            return row === null ? null : whole(row, 'first_seen');
        }, null);
    }

    runsByCause(tab: string): Readonly<Record<string, number>> {
        return guarded(() => Object.fromEntries(all(this.runs, tab).map((row) => [text(row, 'cause'), whole(row, 'n')])), {});
    }

    compactions(tab: string): readonly { readonly tokensBefore: number | null; readonly tokensAfter: number | null; readonly origin: 'operator' | 'auto' }[] {
        return guarded(() => all(this.compacted, tab).map((row) => ({ tokensBefore: maybeWhole(row, 'tokens_before'), tokensAfter: maybeWhole(row, 'tokens_after'), origin: text(row, 'origin') === 'auto' ? 'auto' : 'operator' })), []);
    }
}
