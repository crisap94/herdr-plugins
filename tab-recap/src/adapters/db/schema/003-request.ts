import { rebuildTable } from '../rebuild.ts';
import type { DatabaseSync } from 'node:sqlite';

/** An id column as lowercase hex UUID text, as the other `_readable` views show it. */
const text = (column: string): string =>
    `lower(substr(hex(${column}),1,8)||'-'||substr(hex(${column}),9,4)||'-'||substr(hex(${column}),13,4)||'-'||substr(hex(${column}),17,4)||'-'||substr(hex(${column}),21,12))`;

const REQUEST = `CREATE TABLE request_new (
  id     BLOB    NOT NULL PRIMARY KEY CHECK (length(id) = 16),
  at     INTEGER NOT NULL,
  kind   TEXT    NOT NULL CHECK (kind IN ('refresh','visibility','compact')),
  target TEXT    NOT NULL,
  hidden TEXT    CHECK (hidden IN ('hide','show','toggle')),
  pane   TEXT,
  note   TEXT,
  CHECK ((kind = 'visibility') = (hidden IS NOT NULL)),
  CHECK (kind = 'compact' OR (pane IS NULL AND note IS NULL))
) STRICT, WITHOUT ROWID`;

/** The request queue learns `compact` (target = the tab, `pane` = the agent to compact or none, `note` = the operator's focus note or none). */
export function rebuildRequests(db: DatabaseSync): void {
    db.exec('DROP VIEW request_readable');
    rebuildTable(db, {
        table: 'request',
        create: REQUEST,
        copy: 'INSERT INTO request_new (id, at, kind, target, hidden) SELECT id, at, kind, target, hidden FROM request',
        after: [`CREATE VIEW request_readable AS SELECT ${text('id')} AS id, at, kind, target, hidden, pane, note FROM request;`],
    });
}
