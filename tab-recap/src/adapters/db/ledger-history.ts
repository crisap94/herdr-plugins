// What an agent's tasks have been through, from the ledger: every fact, open and closed, with its why and dates (queries only).
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { HistoryFact } from '#src/ports/ledger.ts';
import { all, maybeText, text, whole } from './rows.ts';

/** The most facts handed back. */
export const HISTORY_LIMIT = 300;

/** What is cut last: open goal, decisions and questions; then those closed and the standing rules; then what is under way; finished and referring facts go first. */
const KEEP_RANK = `CASE
  WHEN f.section IN ('goal','decisions','needs') AND f.state = 'open' THEN 0
  WHEN f.section IN ('goal','decisions','needs') OR (f.section = 'rules' AND f.state = 'open') THEN 1
  WHEN f.section IN ('now','next') AND f.state = 'open' THEN 2 ELSE 3 END`;

export class LedgerHistory {
    private readonly facts: StatementSync;

    constructor(db: DatabaseSync) {
        this.facts = db.prepare(`SELECT f.section, f.text, f.why, f.state, f.closed_why, f.first_at, f.last_at FROM fact f
          WHERE f.tab_id = ?1 AND f.task_id IN
            (SELECT l.task_id FROM run_task_lane l JOIN transcript t ON t.id = l.transcript_id WHERE t.tab_id = ?1 AND t.pane = ?2)
          ORDER BY ${KEEP_RANK}, f.last_at DESC, f.id LIMIT ${HISTORY_LIMIT}`);
    }

    /** Newest last seen first, whatever was kept. */
    read(tab: string, pane: string): readonly HistoryFact[] {
        return all(this.facts, tab, pane).map((row): HistoryFact => ({
            section: text(row, 'section'), text: text(row, 'text'), why: maybeText(row, 'why'), state: text(row, 'state') === 'open' ? 'open' : 'closed',
            closedWhy: maybeText(row, 'closed_why'), firstAt: whole(row, 'first_at'), lastAt: whole(row, 'last_at'),
        })).toSorted((a, b) => b.lastAt - a.lastAt);
    }
}
