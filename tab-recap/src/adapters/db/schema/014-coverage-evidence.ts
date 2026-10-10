import type { Migration } from './migration.ts';

const uuid = (column: string): string =>
    `lower(substr(hex(${column}),1,8)||'-'||substr(hex(${column}),9,4)||'-'||substr(hex(${column}),13,4)||'-'||substr(hex(${column}),17,4)||'-'||substr(hex(${column}),21,12))`;

const SKIP_GATES = "'below-minimum','busy','in-flight','cooldown','unchanged','no-context','coverage-backoff'";

const DECISION_VIEW = `CREATE VIEW autocompact_decision_readable AS SELECT ${uuid('id')} AS id, tab_id, pane, agent, at, mode, share, tokens, window, gate, verdict, answers, coverage, decider, cost_micro_usd, took_ms, why, requested, asked_verdict, coverage_outcome, unchecked_reason, coverage_missing, coverage_ms, coverage_cost_micro_usd, CASE WHEN compaction_id IS NULL THEN NULL ELSE ${uuid('compaction_id')} END AS compaction_id FROM autocompact_decision`;

export const m014: Migration = {
    version: 14,
    name: 'coverage-evidence',
    up: (db): void => {
        db.exec('DROP VIEW autocompact_skip_readable');
        db.exec('DROP VIEW autocompact_decision_readable');
        db.exec("ALTER TABLE autocompact_decision ADD COLUMN asked_verdict TEXT CHECK (asked_verdict IS NULL OR asked_verdict IN ('compact','wait','undecided','unknown'))");
        db.exec("ALTER TABLE autocompact_decision ADD COLUMN coverage_outcome TEXT CHECK (coverage_outcome IS NULL OR coverage_outcome IN ('passed','missed','unchecked'))");
        db.exec("ALTER TABLE autocompact_decision ADD COLUMN unchecked_reason TEXT CHECK (unchecked_reason IS NULL OR unchecked_reason IN ('no-decider','decider-cannot-answer','no-brief'))");
        db.exec('ALTER TABLE autocompact_decision ADD COLUMN coverage_missing INTEGER CHECK (coverage_missing IS NULL OR coverage_missing >= 0)');
        db.exec('ALTER TABLE autocompact_decision ADD COLUMN coverage_ms INTEGER CHECK (coverage_ms IS NULL OR coverage_ms >= 0)');
        db.exec('ALTER TABLE autocompact_decision ADD COLUMN coverage_cost_micro_usd INTEGER CHECK (coverage_cost_micro_usd IS NULL OR coverage_cost_micro_usd >= 0)');
        db.exec("CREATE TABLE autocompact_brief (decision_id BLOB NOT NULL PRIMARY KEY CHECK (length(decision_id) = 16) REFERENCES autocompact_decision(id) ON DELETE CASCADE, briefed_at INTEGER NOT NULL, body BLOB NOT NULL) STRICT, WITHOUT ROWID");
        db.exec('CREATE INDEX autocompact_brief_by_time ON autocompact_brief(briefed_at)');
        db.exec(`CREATE TABLE autocompact_skip_new (
  tab_id  TEXT    NOT NULL REFERENCES tab(id) ON DELETE CASCADE,
  pane    TEXT    NOT NULL,
  agent   TEXT    NOT NULL,
  at      INTEGER NOT NULL,
  gate    TEXT    NOT NULL CHECK (gate IN (${SKIP_GATES})),
  share   INTEGER CHECK (share IS NULL OR share >= 0),
  detail  TEXT,
  PRIMARY KEY (tab_id, pane)
) STRICT, WITHOUT ROWID`);
        db.exec('INSERT INTO autocompact_skip_new (tab_id, pane, agent, at, gate, share, detail) SELECT tab_id, pane, agent, at, gate, share, detail FROM autocompact_skip');
        db.exec('DROP TABLE autocompact_skip');
        db.exec('ALTER TABLE autocompact_skip_new RENAME TO autocompact_skip');
        db.exec('CREATE VIEW autocompact_skip_readable AS SELECT tab_id, pane, agent, at, gate, share, detail FROM autocompact_skip');
        db.exec(DECISION_VIEW);
    },
};
