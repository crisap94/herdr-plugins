import type { Migration } from './migration.ts';

/** An id column as lowercase hex UUID text, as the other `_readable` views show it (a released file is never edited, so each keeps its own copy). */
const uuid = (column: string): string =>
    `lower(substr(hex(${column}),1,8)||'-'||substr(hex(${column}),9,4)||'-'||substr(hex(${column}),13,4)||'-'||substr(hex(${column}),17,4)||'-'||substr(hex(${column}),21,12))`;

/**
 * Migration 9: a fact keeps its **anchor**, the quote from the writer's input that it comes from (at most 120 characters). Nullable: a fact
 * imported from 1.x, or added before this release, has none. The readable view shows it.
 */
export const m009: Migration = {
    version: 9,
    name: 'anchor',
    up: [
        'ALTER TABLE fact ADD COLUMN anchor TEXT CHECK (anchor IS NULL OR length(anchor) > 0)',
        'DROP VIEW fact_readable',
        `CREATE VIEW fact_readable AS SELECT ${uuid('id')} AS id, tab_id, ${uuid('task_id')} AS task_id, section, text, why, ref, agent, first_at, last_at, state, closed_why, closed_at, anchor FROM fact`,
    ],
};
