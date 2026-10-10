import type { DatabaseSync } from 'node:sqlite';
import { rebuildTable } from '../rebuild.ts';
import type { Migration } from './migration.ts';

const uuid = (column: string): string =>
    `lower(substr(hex(${column}),1,8)||'-'||substr(hex(${column}),9,4)||'-'||substr(hex(${column}),13,4)||'-'||substr(hex(${column}),17,4)||'-'||substr(hex(${column}),21,12))`;

const REQUEST_COLUMNS = 'id, at, kind, target, hidden, pane, note, origin, answer';

const REQUEST = `CREATE TABLE request_new (
  id            BLOB    NOT NULL PRIMARY KEY CHECK (length(id) = 16),
  at            INTEGER NOT NULL,
  kind          TEXT    NOT NULL CHECK (kind IN ('refresh','visibility','compact','curate','handoff')),
  target        TEXT    NOT NULL,
  hidden        TEXT    CHECK (hidden IN ('hide','show','toggle')),
  pane          TEXT,
  note          TEXT,
  origin        TEXT    NOT NULL DEFAULT 'operator' CHECK (origin IN ('operator','auto','request')),
  answer        TEXT    CHECK (answer IS NULL OR length(answer) BETWEEN 1 AND 16),
  to_pane       TEXT,
  refresh_first INTEGER NOT NULL DEFAULT 0 CHECK (refresh_first IN (0,1)),
  CHECK ((kind = 'visibility') = (hidden IS NOT NULL)),
  CHECK (kind IN ('compact','handoff') OR (pane IS NULL AND note IS NULL AND answer IS NULL)),
  CHECK (kind <> 'handoff' OR (pane IS NOT NULL AND to_pane IS NOT NULL)),
  CHECK (kind = 'handoff' OR (to_pane IS NULL AND refresh_first = 0))
) STRICT, WITHOUT ROWID`;

const HANDOFF_ANSWER = `CREATE TABLE handoff_answer (
  id      BLOB    NOT NULL PRIMARY KEY CHECK (length(id) = 16),
  at      INTEGER NOT NULL,
  outcome TEXT    NOT NULL CHECK (outcome IN ('delivered','refused','unsupported','failed')),
  reason  TEXT,
  CHECK ((outcome = 'delivered') = (reason IS NULL))
) STRICT, WITHOUT ROWID`;

function up(db: DatabaseSync): void {
    db.exec('DROP VIEW request_readable');
    rebuildTable(db, {
        table: 'request',
        create: REQUEST,
        copy: `INSERT INTO request_new (${REQUEST_COLUMNS}) SELECT ${REQUEST_COLUMNS} FROM request`,
        after: [`CREATE VIEW request_readable AS SELECT ${uuid('id')} AS id, at, kind, target, hidden, pane, note, origin, to_pane, refresh_first FROM request`],
    });
    db.exec(HANDOFF_ANSWER);
    db.exec('CREATE INDEX handoff_answer_by_time ON handoff_answer(at)');
    db.exec(`CREATE VIEW handoff_answer_readable AS SELECT ${uuid('id')} AS id, at, outcome, reason FROM handoff_answer`);
}

export const m016: Migration = { version: 16, name: 'handoff', up };
