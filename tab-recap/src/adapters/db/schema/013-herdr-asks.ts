import type { Migration } from './migration.ts';

/**
 * Migration 13, herdr asks: a compaction another tool asked for keeps the requester's answer id (`answer`), so a restart can answer what it
 * interrupted; and every compaction request tab-recap has accepted is remembered by (tool, id), so the same id is never acted on again, not even
 * after the request row is taken. The request row cannot do the second: it is deleted when it is taken, and it has no tool name.
 */
export const m013: Migration = {
    version: 13,
    name: 'herdr-asks',
    up: [
        'ALTER TABLE compaction ADD COLUMN answer TEXT CHECK (answer IS NULL OR length(answer) BETWEEN 1 AND 16)',
        `CREATE TABLE compact_ask (
  tool  TEXT    NOT NULL CHECK (length(tool) BETWEEN 1 AND 32),
  id    TEXT    NOT NULL CHECK (length(id) BETWEEN 1 AND 16),
  pane  TEXT    NOT NULL,
  at    INTEGER NOT NULL,
  PRIMARY KEY (tool, id)
) STRICT, WITHOUT ROWID`,
    ],
};
