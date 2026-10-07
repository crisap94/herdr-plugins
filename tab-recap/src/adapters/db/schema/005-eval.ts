import type { Migration } from './migration.ts';

const RUN_INPUT = `CREATE TABLE run_input (
  run_id   BLOB NOT NULL PRIMARY KEY CHECK (length(run_id) = 16) REFERENCES run(id) ON DELETE CASCADE,
  document BLOB NOT NULL,
  bytes    INTEGER NOT NULL CHECK (bytes > 0)
) STRICT, WITHOUT ROWID`;

const VERDICT = `CREATE TABLE verdict (
  id       BLOB NOT NULL PRIMARY KEY CHECK (length(id) = 16),
  run_id   BLOB NOT NULL CHECK (length(run_id) = 16) REFERENCES run(id) ON DELETE CASCADE,
  item_key TEXT,
  check_id TEXT NOT NULL,
  pass     INTEGER NOT NULL CHECK (pass IN (0,1)),
  critique TEXT,
  judge    TEXT NOT NULL,
  at       INTEGER NOT NULL,
  source   TEXT NOT NULL CHECK (source IN ('judge','operator'))
) STRICT, WITHOUT ROWID`;

/**
 * Migration 5: what the recap's quality is measured from. `run_input` is the document the writer was given (gzip; deleted by the daily
 * retention, the run stays), `run.gate_stats` the gates' counts as JSON (null for runs before this), `verdict` the answers of the judge
 * and of the operator, one row per check.
 */
export const m005: Migration = {
    version: 5,
    name: 'eval',
    up: [
        RUN_INPUT,
        'ALTER TABLE run ADD COLUMN gate_stats TEXT',
        VERDICT,
        'CREATE INDEX verdict_by_run ON verdict(run_id, check_id)',
    ],
};
