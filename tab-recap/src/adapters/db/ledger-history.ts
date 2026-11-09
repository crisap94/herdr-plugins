import type { Database } from 'bun:sqlite';
import { sql } from 'drizzle-orm';
import type { HistoryFact } from '#src/ports/ledger.ts';
import { ormOf, type Orm } from './orm.ts';
import { maybeText, maybeWhole, text, whole } from './rows.ts';
import type { Row } from './rows.ts';

export const HISTORY_LIMIT = 300;

const KEEP_RANK = `CASE
  WHEN f.section IN ('goal','decisions','needs') AND f.state = 'open' THEN 0
  WHEN f.section IN ('goal','decisions','needs') OR (f.section = 'rules' AND f.state = 'open') THEN 1
  WHEN f.section IN ('now','next') AND f.state = 'open' THEN 2 ELSE 3 END`;

export class LedgerHistory {
    private readonly orm: Orm;

    constructor(db: Database) {
        this.orm = ormOf(db);
    }

    read(tab: string, pane: string): readonly HistoryFact[] {
        return this.orm.all<Row>(sql`SELECT f.section, f.text, f.why, f.state, f.closed_why, f.closed_at, f.first_at, f.last_at FROM fact f
          WHERE f.tab_id = ${tab} AND f.task_id IN
            (SELECT l.task_id FROM run_task_lane l JOIN transcript t ON t.id = l.transcript_id WHERE t.tab_id = ${tab} AND t.pane = ${pane})
          ORDER BY ${sql.raw(KEEP_RANK)}, f.last_at DESC, f.id LIMIT ${sql.raw(String(HISTORY_LIMIT))}`).map((row): HistoryFact => ({
            section: text(row, 'section'), text: text(row, 'text'), why: maybeText(row, 'why'), state: text(row, 'state') === 'open' ? 'open' : 'closed',
            closedWhy: maybeText(row, 'closed_why'), closedAt: maybeWhole(row, 'closed_at'), firstAt: whole(row, 'first_at'), lastAt: whole(row, 'last_at'),
        })).toSorted((a, b) => b.lastAt - a.lastAt);
    }
}
