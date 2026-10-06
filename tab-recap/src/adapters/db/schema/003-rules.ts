import { rebuildTable } from '../rebuild.ts';
import { rebuildRequests } from './003-request.ts';
import type { Migration } from './migration.ts';

const ITEM = `CREATE TABLE item_new (
  run_id BLOB NOT NULL CHECK (length(run_id) = 16), task_id BLOB NOT NULL CHECK (length(task_id) = 16),
  view     TEXT NOT NULL CHECK (view IN ('recap','story')),
  section  TEXT NOT NULL CHECK (section IN ('goal','now','needs','done','decisions','next','links','rules')),
  position INTEGER NOT NULL CHECK (position >= 0),
  text     TEXT NOT NULL CHECK (length(text) > 0),
  PRIMARY KEY (run_id, task_id, view, section, position),
  FOREIGN KEY (run_id, task_id) REFERENCES run_task(run_id, task_id) ON DELETE CASCADE,
  CHECK (view = 'recap' OR section IN ('goal','done','decisions','links')),
  CHECK (section <> 'rules' OR view = 'recap'),
  CHECK (position < CASE
    WHEN section = 'goal' THEN 1
    WHEN view = 'story' AND section = 'done'      THEN 15
    WHEN view = 'story' AND section = 'decisions' THEN 10
    WHEN view = 'story' AND section = 'links'     THEN 12
    WHEN section IN ('now','needs','decisions')   THEN 3
    WHEN section = 'links' THEN 6 ELSE 5 END)
) STRICT, WITHOUT ROWID`;

/** Migration 3: an item may be a standing rule (`section='rules'`, view recap, at most 5), and a request may be a compaction. Both tables are rebuilt: a CHECK cannot be altered. A lane also keeps how full its agent's context is (nullable columns). */
export const m003: Migration = {
    version: 3,
    name: 'compaction',
    up: (db): void => {
        rebuildTable(db, {
            table: 'item',
            create: ITEM,
            copy: 'INSERT INTO item_new (run_id, task_id, view, section, position, text) SELECT run_id, task_id, view, section, position, text FROM item',
        });
        rebuildRequests(db);
        db.exec('ALTER TABLE lane ADD COLUMN context_tokens INTEGER');
        db.exec('ALTER TABLE lane ADD COLUMN context_window INTEGER');
        db.exec("ALTER TABLE lane ADD COLUMN context_source TEXT CHECK (context_source IN ('agent','catalogue','table','observed','setting'))");
    },
};
