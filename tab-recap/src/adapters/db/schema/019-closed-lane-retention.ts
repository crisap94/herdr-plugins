import type { Migration } from './migration.ts';

const REQUEST_ID_TEXT = "lower(substr(hex(id),1,8)||'-'||substr(hex(id),9,4)||'-'||substr(hex(id),13,4)||'-'||substr(hex(id),17,4)||'-'||substr(hex(id),21,12))";

const TASK_ID_TEXT = "lower(substr(hex(task_id),1,8)||'-'||substr(hex(task_id),9,4)||'-'||substr(hex(task_id),13,4)||'-'||substr(hex(task_id),17,4)||'-'||substr(hex(task_id),21,12))";

const REQUEST_READABLE = `CREATE VIEW request_readable AS SELECT ${REQUEST_ID_TEXT} AS id, at, kind, target, hidden, pane, note, origin, to_pane, refresh_first, closed_at FROM request`;

const CLOSED_LANE = `CREATE TABLE closed_lane (
  tab_id    TEXT    NOT NULL REFERENCES tab(id) ON DELETE CASCADE,
  pane      TEXT    NOT NULL,
  closed_at INTEGER NOT NULL CHECK (closed_at >= 0),
  agent     TEXT    NOT NULL,
  cwd       TEXT,
  task_id   BLOB    CHECK (task_id IS NULL OR length(task_id) = 16) REFERENCES task(id) ON DELETE CASCADE,
  task_name TEXT    CHECK (task_name IS NULL OR task_id IS NOT NULL),
  PRIMARY KEY (tab_id, pane, closed_at)
) STRICT, WITHOUT ROWID`;

const CLOSED_LANE_READABLE = `CREATE VIEW closed_lane_readable AS SELECT tab_id, pane, closed_at, agent, cwd, CASE WHEN task_id IS NULL THEN NULL ELSE ${TASK_ID_TEXT} END AS task_id, task_name FROM closed_lane`;

export const m019: Migration = {
    version: 19,
    name: 'closed-lane-retention',
    up: [
        'ALTER TABLE lane ADD COLUMN since INTEGER',
        "ALTER TABLE request ADD COLUMN closed_at INTEGER CHECK (closed_at IS NULL OR kind = 'handoff')",
        'DROP VIEW request_readable',
        REQUEST_READABLE,
        CLOSED_LANE,
        'CREATE INDEX closed_lane_by_task ON closed_lane(task_id)',
        'CREATE INDEX closed_lane_by_closed_at ON closed_lane(closed_at)',
        CLOSED_LANE_READABLE,
    ],
};
