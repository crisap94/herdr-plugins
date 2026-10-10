import type { DatabaseSync } from 'node:sqlite';
import { rebuildTable } from '../rebuild.ts';
import type { Migration } from './migration.ts';

/** An id column as lowercase hex UUID text, as the other `_readable` views show it (a released file is never edited, so each keeps its own copy). */
const uuid = (column: string): string =>
    `lower(substr(hex(${column}),1,8)||'-'||substr(hex(${column}),9,4)||'-'||substr(hex(${column}),13,4)||'-'||substr(hex(${column}),17,4)||'-'||substr(hex(${column}),21,12))`;

const COMPACTION_COLUMNS = 'tab_id, pane, agent, stage, brief, writer, template_why, started_at, stage_at, finished_at, tokens_before, tokens_after, took_ms, retried, why, dismissed_at, boundary_id, origin';

/** the view's columns: the table's, with the boundary as its readable id */
const COMPACTION_VIEW = `tab_id, pane, agent, stage, brief, writer, template_why, started_at, stage_at, finished_at, tokens_before, tokens_after, took_ms, retried, why, dismissed_at, CASE WHEN boundary_id IS NULL THEN NULL ELSE ${uuid('boundary_id')} END AS boundary_id, origin`;

const COMPACTION = `CREATE TABLE compaction_new (
  id            BLOB    NOT NULL PRIMARY KEY CHECK (length(id) = 16),
  tab_id        TEXT    NOT NULL REFERENCES tab(id) ON DELETE CASCADE,
  pane          TEXT    NOT NULL,
  agent         TEXT    NOT NULL,
  stage         TEXT    NOT NULL CHECK (stage IN ('briefing','compacting','restoring','compacted','failed','unconfirmed','skipped')),
  brief         TEXT    CHECK (brief IN ('written','template')),
  writer        TEXT,
  template_why  TEXT,
  started_at    INTEGER NOT NULL,
  stage_at      INTEGER NOT NULL,
  finished_at   INTEGER,
  tokens_before INTEGER CHECK (tokens_before IS NULL OR tokens_before >= 0),
  tokens_after  INTEGER CHECK (tokens_after  IS NULL OR tokens_after  >= 0),
  took_ms       INTEGER,
  retried       INTEGER NOT NULL DEFAULT 0 CHECK (retried IN (0,1)),
  why           TEXT,
  dismissed_at  INTEGER,
  boundary_id   BLOB    CHECK (boundary_id IS NULL OR length(boundary_id) = 16) REFERENCES boundary(id) ON DELETE SET NULL,
  origin        TEXT    NOT NULL DEFAULT 'operator' CHECK (origin IN ('operator','auto','request')),
  CHECK ((finished_at IS NULL) = (stage IN ('briefing','compacting','restoring'))),
  CHECK (brief IS NOT NULL OR stage IN ('skipped','briefing') OR template_why IS NULL)
) STRICT, WITHOUT ROWID`;

const REQUEST = `CREATE TABLE request_new (
  id     BLOB    NOT NULL PRIMARY KEY CHECK (length(id) = 16),
  at     INTEGER NOT NULL,
  kind   TEXT    NOT NULL CHECK (kind IN ('refresh','visibility','compact','curate')),
  target TEXT    NOT NULL,
  hidden TEXT    CHECK (hidden IN ('hide','show','toggle')),
  pane   TEXT,
  note   TEXT,
  origin TEXT    NOT NULL DEFAULT 'operator' CHECK (origin IN ('operator','auto','request')),
  answer TEXT    CHECK (answer IS NULL OR length(answer) BETWEEN 1 AND 16),
  CHECK ((kind = 'visibility') = (hidden IS NOT NULL)),
  CHECK (kind = 'compact' OR (pane IS NULL AND note IS NULL AND answer IS NULL))
) STRICT, WITHOUT ROWID`;

/**
 * Migration 12, herdr events: a compaction or a request may come from another tool (`origin` = `request`), so both CHECKs learn the word;
 * a request keeps the requester's `answer` id, which tab-recap writes back on its pane. A CHECK cannot be altered: both tables are rebuilt.
 */
function up(db: DatabaseSync): void {
    db.exec('DROP VIEW compaction_readable');
    db.exec('DROP VIEW request_readable');
    rebuildTable(db, {
        table: 'compaction',
        create: COMPACTION,
        copy: `INSERT INTO compaction_new (id, ${COMPACTION_COLUMNS}) SELECT id, ${COMPACTION_COLUMNS} FROM compaction`,
        after: [
            'CREATE INDEX compaction_by_lane ON compaction(tab_id, pane, started_at)',
            'CREATE INDEX compaction_by_boundary ON compaction(boundary_id)',
            `CREATE VIEW compaction_readable AS SELECT ${uuid('id')} AS id, ${COMPACTION_VIEW} FROM compaction`,
        ],
    });
    rebuildTable(db, {
        table: 'request',
        create: REQUEST,
        copy: 'INSERT INTO request_new (id, at, kind, target, hidden, pane, note, origin) SELECT id, at, kind, target, hidden, pane, note, origin FROM request',
        after: [`CREATE VIEW request_readable AS SELECT ${uuid('id')} AS id, at, kind, target, hidden, pane, note, origin FROM request`],
    });
}

export const m012: Migration = { version: 12, name: 'herdr-events', up };
