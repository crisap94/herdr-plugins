import type { Migration } from './migration.ts';

/** An id column as lowercase hex UUID text, as the other `_readable` views show it. */
const text = (column: string): string =>
    `lower(substr(hex(${column}),1,8)||'-'||substr(hex(${column}),9,4)||'-'||substr(hex(${column}),13,4)||'-'||substr(hex(${column}),17,4)||'-'||substr(hex(${column}),21,12))`;

const COMPACTION = `CREATE TABLE compaction (
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
  CHECK ((finished_at IS NULL) = (stage IN ('briefing','compacting','restoring'))),
  CHECK (brief IS NOT NULL OR stage IN ('skipped','briefing') OR template_why IS NULL)
) STRICT, WITHOUT ROWID`;

const COLUMNS = 'tab_id, pane, agent, stage, brief, writer, template_why, started_at, stage_at, finished_at, tokens_before, tokens_after, took_ms, retried, why, dismissed_at';

/** Migration 4: a compaction is a record (the lane's stage, the brief's origin, the tokens before and after); the daemon writes it, the column and the bar read it. */
export const m004: Migration = {
    version: 4,
    name: 'compaction-record',
    up: [
        COMPACTION,
        'CREATE INDEX compaction_by_lane ON compaction(tab_id, pane, started_at)',
        `CREATE VIEW compaction_readable AS SELECT ${text('id')} AS id, ${COLUMNS} FROM compaction`,
    ],
};
