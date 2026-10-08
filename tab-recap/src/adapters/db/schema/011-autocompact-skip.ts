import type { Migration } from './migration.ts';

/**
 * Migration 11, autocompact skips: each lane keeps its latest skip (the gate that stopped its consideration, its share when known, a short detail).
 * One row per lane, replaced at each skip and removed when the lane gets a decision; deleting a tab takes its rows. A readable view for the listing and the shell.
 * A decision also says whether a compaction was requested for it (`requested`): only a requested `compact` of mode `on` holds the other lanes.
 */
export const m011: Migration = {
    version: 11,
    name: 'autocompact-skip',
    up: [
        `CREATE TABLE autocompact_skip (
  tab_id  TEXT    NOT NULL REFERENCES tab(id) ON DELETE CASCADE,
  pane    TEXT    NOT NULL,
  agent   TEXT    NOT NULL,
  at      INTEGER NOT NULL,
  gate    TEXT    NOT NULL CHECK (gate IN ('below-minimum','busy','in-flight','cooldown','unchanged','no-context')),
  share   INTEGER CHECK (share IS NULL OR share >= 0),
  detail  TEXT,
  PRIMARY KEY (tab_id, pane)
) STRICT, WITHOUT ROWID`,
        'CREATE VIEW autocompact_skip_readable AS SELECT tab_id, pane, agent, at, gate, share, detail FROM autocompact_skip',
        'ALTER TABLE autocompact_decision ADD COLUMN requested INTEGER NOT NULL DEFAULT 0 CHECK (requested IN (0, 1))',
        'DROP VIEW autocompact_decision_readable',
        `CREATE VIEW autocompact_decision_readable AS SELECT lower(substr(hex(id),1,8)||'-'||substr(hex(id),9,4)||'-'||substr(hex(id),13,4)||'-'||substr(hex(id),17,4)||'-'||substr(hex(id),21,12)) AS id, tab_id, pane, agent, at, mode, share, tokens, window, gate, verdict, answers, coverage, decider, cost_micro_usd, took_ms, why, requested, CASE WHEN compaction_id IS NULL THEN NULL ELSE lower(substr(hex(compaction_id),1,8)||'-'||substr(hex(compaction_id),9,4)||'-'||substr(hex(compaction_id),13,4)||'-'||substr(hex(compaction_id),17,4)||'-'||substr(hex(compaction_id),21,12)) END AS compaction_id FROM autocompact_decision`,
    ],
};
