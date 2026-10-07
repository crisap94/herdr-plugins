// What a tab's agent has been through, from the recap rows already kept: every distinct line, with when it came and went (queries only).
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { HistoryItem } from '#src/ports/recap-records.ts';
import { all, text, whole } from './rows.ts';
import type { Row } from './rows.ts';

/** The most lines handed back. */
export const HISTORY_LIMIT = 300;

/** What is cut last: decisions, open questions and the goal; finished items and references go first. */
const KEEP_RANK = "CASE i.section WHEN 'goal' THEN 0 WHEN 'decisions' THEN 0 WHEN 'needs' THEN 0 WHEN 'rules' THEN 1 WHEN 'now' THEN 2 WHEN 'next' THEN 2 ELSE 3 END";

const itemOf = (row: Row): HistoryItem => ({ section: text(row, 'section'), text: text(row, 'text'), firstAt: whole(row, 'first_at'), lastAt: whole(row, 'last_at'), seen: whole(row, 'seen') });

export class SessionHistory {
    private readonly distinct: StatementSync;

    constructor(db: DatabaseSync) {
        this.distinct = db.prepare(`SELECT i.section, i.text, MIN(r.at) AS first_at, MAX(r.at) AS last_at, COUNT(DISTINCT r.id) AS seen
          FROM item i JOIN run r ON r.id = i.run_id JOIN chapter c ON c.id = r.chapter_id
          WHERE i.view = 'recap' AND c.tab_id = ?1 AND i.task_id IN
            (SELECT l.task_id FROM run_task_lane l JOIN transcript t ON t.id = l.transcript_id WHERE t.tab_id = ?1 AND t.pane = ?2)
          GROUP BY i.section, i.text
          ORDER BY ${KEEP_RANK}, last_at DESC, i.section, i.text
          LIMIT ${HISTORY_LIMIT}`);
    }

    /** Newest first, whatever was kept. */
    read(tab: string, pane: string): readonly HistoryItem[] {
        return all(this.distinct, tab, pane).map(itemOf).toSorted((a, b) => b.lastAt - a.lastAt);
    }
}
