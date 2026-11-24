import type { Database } from 'bun:sqlite';
import { sql } from 'drizzle-orm';
import type { HistoryFact } from '@stateforge-labs/session-ledger';
import { isClosedWhy, isSection } from '@stateforge-labs/session-ledger';
import { textOf } from '@stateforge-labs/session-ledger';
import { instant } from '@stateforge-labs/session-ledger';
import type { SessionKey, ScopeId } from '#src/recap/domain/ids.ts';
import { ormOf, type Orm } from './orm.ts';
import { retiredFloor } from './retention.ts';
import { maybeText, maybeWhole, text, whole } from './rows.ts';
import type { Row } from './rows.ts';

export const HISTORY_LIMIT = 300;

type Ordering = -1 | 0 | 1;

const newestFirst = (a: HistoryFact, b: HistoryFact): Ordering => {
    if (a.lastAt === b.lastAt) {
        return 0;
    }
    return a.lastAt > b.lastAt ? -1 : 1;
};

const KEEP_RANK = `CASE
  WHEN f.section IN ('goal','decisions','needs') AND f.state = 'open' THEN 0
  WHEN f.section IN ('goal','decisions','needs') OR (f.section = 'rules' AND f.state = 'open') THEN 1
  WHEN f.section IN ('now','next') AND f.state = 'open' THEN 2 ELSE 3 END`;

export class LedgerHistory {
    private readonly orm: Orm;

    constructor(db: Database) {
        this.orm = ormOf(db);
    }

    read(tab: ScopeId, pane: SessionKey): readonly HistoryFact[] {
        return this.orm.all<Row>(sql`SELECT f.section, f.text, f.why, f.state, f.closed_why, f.closed_at, f.first_at, f.last_at FROM fact f
          WHERE f.tab_id = ${tab} AND f.task_id IN
            (SELECT l.task_id FROM run_task_lane l JOIN transcript t ON t.id = l.transcript_id JOIN run r ON r.id = l.run_id JOIN chapter c ON c.id = r.chapter_id
              WHERE t.tab_id = ${tab} AND t.pane = ${pane} AND c.n >= ${retiredFloor(tab)})
          ORDER BY ${sql.raw(KEEP_RANK)}, f.last_at DESC, f.id LIMIT ${sql.raw(String(HISTORY_LIMIT))}`).flatMap((row): readonly HistoryFact[] => {
            const [section, closedWhy] = [text(row, 'section'), maybeText(row, 'closed_why')];
            if (!isSection(section) || (closedWhy !== null && !isClosedWhy(closedWhy))) {
                return [];
            }
            const [closedAt, why] = [maybeWhole(row, 'closed_at'), maybeText(row, 'why')];
            return [{
                section, text: textOf(text(row, 'text')), why: why === null ? null : textOf(why), state: text(row, 'state') === 'open' ? 'open' : 'closed',
                closedWhy, closedAt: closedAt === null ? null : instant(closedAt), firstAt: instant(whole(row, 'first_at')), lastAt: instant(whole(row, 'last_at')),
            }];
        }).toSorted(newestFirst);
    }
}
