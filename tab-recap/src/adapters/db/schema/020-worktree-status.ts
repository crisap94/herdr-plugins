import type { Migration } from './migration.ts';

const WORKTREE_STATUS = `CREATE TABLE worktree_status (
  root      TEXT    NOT NULL PRIMARY KEY,
  branch    TEXT    NOT NULL,
  ahead     INTEGER CHECK (ahead IS NULL OR ahead >= 0),
  tracked   INTEGER NOT NULL CHECK (tracked >= 0),
  untracked INTEGER CHECK (untracked IS NULL OR untracked >= 0),
  at        INTEGER NOT NULL CHECK (at >= 0)
) STRICT, WITHOUT ROWID`;

const PANE_WORKTREE = `CREATE TABLE pane_worktree (
  pane TEXT NOT NULL PRIMARY KEY,
  root TEXT NOT NULL
) STRICT, WITHOUT ROWID`;

const PANE_NOTE = `CREATE TABLE pane_note (
  pane  TEXT NOT NULL,
  label TEXT NOT NULL,
  value TEXT NOT NULL CHECK (value <> ''),
  PRIMARY KEY (pane, label)
) STRICT, WITHOUT ROWID`;

const PANE_ALERT = `CREATE TABLE pane_alert (
  source  TEXT    NOT NULL CHECK (source <> ''),
  pane    TEXT    NOT NULL,
  label   TEXT    NOT NULL,
  at      INTEGER NOT NULL CHECK (at >= 0),
  details TEXT    NOT NULL,
  PRIMARY KEY (source, pane)
) STRICT, WITHOUT ROWID`;

export const m020: Migration = {
    version: 20,
    name: 'worktree-status',
    up: [
        WORKTREE_STATUS,
        PANE_WORKTREE,
        'CREATE INDEX pane_worktree_by_root ON pane_worktree(root)',
        PANE_NOTE,
        PANE_ALERT,
        'CREATE INDEX pane_alert_by_pane ON pane_alert(pane)',
    ],
};
