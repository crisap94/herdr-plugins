import type { Migration } from './migration.ts';

const uuid = (column: string): string =>
    `lower(substr(hex(${column}),1,8)||'-'||substr(hex(${column}),9,4)||'-'||substr(hex(${column}),13,4)||'-'||substr(hex(${column}),17,4)||'-'||substr(hex(${column}),21,12))`;

const DECISION_VIEW = `CREATE VIEW autocompact_decision_readable AS SELECT ${uuid('id')} AS id, tab_id, pane, agent, at, mode, share, tokens, window, gate, verdict, answers, coverage, decider, cost_micro_usd, took_ms, why, requested, asked_verdict, coverage_outcome, unchecked_reason, coverage_missing, coverage_ms, coverage_cost_micro_usd, lane_status, CASE WHEN compaction_id IS NULL THEN NULL ELSE ${uuid('compaction_id')} END AS compaction_id FROM autocompact_decision`;

export const m018: Migration = {
    version: 18,
    name: 'lane-status',
    up: (db): void => {
        db.exec('DROP VIEW autocompact_decision_readable');
        db.exec("ALTER TABLE autocompact_decision ADD COLUMN lane_status TEXT CHECK (lane_status IS NULL OR lane_status IN ('idle','done','working'))");
        db.exec(DECISION_VIEW);
    },
};
