import type { Migration } from './migration.ts';

/** An id column as lowercase hex UUID text, as the other `_readable` views show it. */
const text = (column: string): string =>
    `lower(substr(hex(${column}),1,8)||'-'||substr(hex(${column}),9,4)||'-'||substr(hex(${column}),13,4)||'-'||substr(hex(${column}),17,4)||'-'||substr(hex(${column}),21,12))`;

const BOUNDARY_COLUMNS = `${text('id')} AS id, ${text('chapter_id')} AS chapter_id, ${text('transcript_id')} AS transcript_id, kind, at, trigger, cursor, CASE WHEN replaces_id IS NULL THEN NULL ELSE ${text('replaces_id')} END AS replaces_id, tokens_before, tokens_after, took_ms`;
const COMPACTION_COLUMNS = 'tab_id, pane, agent, stage, brief, writer, template_why, started_at, stage_at, finished_at, tokens_before, tokens_after, took_ms, retried, why, dismissed_at';

/**
 * Migration 8: a compaction the plugin drove points at the boundary it caused, and a boundary keeps what its mark said about the
 * context (the timeline draws it, and an agent's own compaction has no other record). Both nullable; views recreated to show them.
 */
export const m008: Migration = {
    version: 8,
    name: 'boundary-link',
    up: [
        'ALTER TABLE compaction ADD COLUMN boundary_id BLOB CHECK (boundary_id IS NULL OR length(boundary_id) = 16) REFERENCES boundary(id) ON DELETE SET NULL',
        'CREATE INDEX compaction_by_boundary ON compaction(boundary_id)',
        'ALTER TABLE boundary ADD COLUMN tokens_before INTEGER CHECK (tokens_before IS NULL OR tokens_before >= 0)',
        'ALTER TABLE boundary ADD COLUMN tokens_after INTEGER CHECK (tokens_after IS NULL OR tokens_after >= 0)',
        'ALTER TABLE boundary ADD COLUMN took_ms INTEGER CHECK (took_ms IS NULL OR took_ms >= 0)',
        'DROP VIEW boundary_readable',
        `CREATE VIEW boundary_readable AS SELECT ${BOUNDARY_COLUMNS} FROM boundary`,
        'DROP VIEW compaction_readable',
        `CREATE VIEW compaction_readable AS SELECT ${text('id')} AS id, ${COMPACTION_COLUMNS}, CASE WHEN boundary_id IS NULL THEN NULL ELSE ${text('boundary_id')} END AS boundary_id FROM compaction`,
    ],
};
