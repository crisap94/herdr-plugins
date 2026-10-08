import type { Migration } from './migration.ts';

/**
 * Migration 11, autocompact skips: each lane keeps its latest skip (the gate that stopped its consideration, its share when known, a short detail).
 * One row per lane, replaced at each skip and removed when the lane gets a decision; deleting a tab takes its rows. A readable view for the listing and the shell.
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
    ],
};
