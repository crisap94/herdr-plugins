import type { Migration } from './migration.ts';

/** An id column as lowercase hex UUID text, as the other `_readable` views show it (a released file is never edited, so each keeps its own copy). */
const uuid = (column: string): string =>
    `lower(substr(hex(${column}),1,8)||'-'||substr(hex(${column}),9,4)||'-'||substr(hex(${column}),13,4)||'-'||substr(hex(${column}),17,4)||'-'||substr(hex(${column}),21,12))`;

const BOUNDARY_COLUMNS = 'id, chapter_id, transcript_id, kind, at, trigger, cursor, replaces_id, tokens_before, tokens_after, took_ms';
const COMPACTION_COLUMNS = 'tab_id, pane, agent, stage, brief, writer, template_why, started_at, stage_at, finished_at, tokens_before, tokens_after, took_ms, retried, why, dismissed_at';

/** The old chapter_span, recreated after the rebuild (the view reads `boundary`, so it cannot stand while the table is swapped). */
const CHAPTER_SPAN = `CREATE VIEW chapter_span AS
  SELECT c.id AS chapter_id, c.tab_id, c.n, c.started_at,
         LEAD(c.started_at) OVER (PARTITION BY c.tab_id ORDER BY c.n) AS sealed_at,
         COALESCE((SELECT group_concat(kind) FROM boundary b WHERE b.chapter_id = c.id), 'start') AS cause
  FROM chapter c`;

/**
 * Migration 10, autocompact: a boundary's trigger is `plugin | manual | auto` (every stored `manual` was plugin-driven by the old rule, so it
 * becomes `plugin`; the table is rebuilt for the new CHECK), a compaction and a request for one say who started them (`origin`), and every autocompact consideration
 * that passed the soft limit is a row of `autocompact_decision`.
 */
export const m010: Migration = {
    version: 10,
    name: 'autocompact',
    up: [
        'DROP VIEW chapter_span',
        'DROP VIEW boundary_readable',
        `CREATE TABLE boundary_new (
  id            BLOB    NOT NULL PRIMARY KEY CHECK (length(id) = 16),
  chapter_id    BLOB    NOT NULL CHECK (length(chapter_id) = 16) REFERENCES chapter(id) ON DELETE CASCADE,
  transcript_id BLOB    NOT NULL CHECK (length(transcript_id) = 16) REFERENCES transcript(id) ON DELETE CASCADE,
  kind          TEXT    NOT NULL CHECK (kind IN ('compacted','switched','rewritten')),
  at            INTEGER NOT NULL,
  trigger       TEXT    CHECK (trigger IN ('auto','manual','plugin')),
  cursor        INTEGER NOT NULL,
  replaces_id   BLOB    CHECK (replaces_id IS NULL OR length(replaces_id) = 16) REFERENCES transcript(id) ON DELETE SET NULL,
  tokens_before INTEGER CHECK (tokens_before IS NULL OR tokens_before >= 0),
  tokens_after  INTEGER CHECK (tokens_after IS NULL OR tokens_after >= 0),
  took_ms       INTEGER CHECK (took_ms IS NULL OR took_ms >= 0),
  CHECK (kind = 'switched'  OR replaces_id IS NULL),
  CHECK (kind = 'compacted' OR trigger IS NULL)
) STRICT, WITHOUT ROWID`,
        `INSERT INTO boundary_new (${BOUNDARY_COLUMNS}) SELECT id, chapter_id, transcript_id, kind, at, CASE trigger WHEN 'manual' THEN 'plugin' ELSE trigger END, cursor, replaces_id, tokens_before, tokens_after, took_ms FROM boundary`,
        'DROP TABLE boundary',
        'ALTER TABLE boundary_new RENAME TO boundary',
        'CREATE INDEX boundary_by_chapter ON boundary(chapter_id)',
        'CREATE INDEX boundary_by_transcript ON boundary(transcript_id)',
        'CREATE INDEX boundary_by_replaced ON boundary(replaces_id)',
        CHAPTER_SPAN,
        `CREATE VIEW boundary_readable AS SELECT ${uuid('id')} AS id, ${uuid('chapter_id')} AS chapter_id, ${uuid('transcript_id')} AS transcript_id, kind, at, trigger, cursor, CASE WHEN replaces_id IS NULL THEN NULL ELSE ${uuid('replaces_id')} END AS replaces_id, tokens_before, tokens_after, took_ms FROM boundary`,
        "ALTER TABLE compaction ADD COLUMN origin TEXT NOT NULL DEFAULT 'operator' CHECK (origin IN ('operator','auto'))",
        'DROP VIEW compaction_readable',
        `CREATE VIEW compaction_readable AS SELECT ${uuid('id')} AS id, ${COMPACTION_COLUMNS}, CASE WHEN boundary_id IS NULL THEN NULL ELSE ${uuid('boundary_id')} END AS boundary_id, origin FROM compaction`,
        "ALTER TABLE request ADD COLUMN origin TEXT NOT NULL DEFAULT 'operator' CHECK (origin IN ('operator','auto'))",
        'DROP VIEW request_readable',
        `CREATE VIEW request_readable AS SELECT ${uuid('id')} AS id, at, kind, target, hidden, pane, note, origin FROM request`,
        `CREATE TABLE autocompact_decision (
  id            BLOB    NOT NULL PRIMARY KEY CHECK (length(id) = 16),
  tab_id        TEXT    NOT NULL REFERENCES tab(id) ON DELETE CASCADE,
  pane          TEXT    NOT NULL,
  agent         TEXT    NOT NULL,
  at            INTEGER NOT NULL,
  mode          TEXT    NOT NULL CHECK (mode IN ('shadow','on')),
  share         INTEGER NOT NULL CHECK (share >= 0),
  tokens        INTEGER NOT NULL CHECK (tokens >= 0),
  window        INTEGER NOT NULL CHECK (window > 0),
  gate          TEXT    NOT NULL CHECK (gate IN ('ask','ceiling','coverage')),
  verdict       TEXT    NOT NULL CHECK (verdict IN ('compact','wait','undecided','unknown')),
  answers       TEXT    NOT NULL,
  coverage      TEXT,
  decider       TEXT,
  cost_micro_usd INTEGER NOT NULL DEFAULT 0 CHECK (cost_micro_usd >= 0),
  took_ms       INTEGER CHECK (took_ms IS NULL OR took_ms >= 0),
  why           TEXT,
  compaction_id BLOB    CHECK (compaction_id IS NULL OR length(compaction_id) = 16) REFERENCES compaction(id) ON DELETE SET NULL
) STRICT, WITHOUT ROWID`,
        'CREATE INDEX autocompact_decision_by_lane ON autocompact_decision(tab_id, pane, at)',
        'CREATE INDEX autocompact_decision_by_compaction ON autocompact_decision(compaction_id)',
        `CREATE VIEW autocompact_decision_readable AS SELECT ${uuid('id')} AS id, tab_id, pane, agent, at, mode, share, tokens, window, gate, verdict, answers, coverage, decider, cost_micro_usd, took_ms, why, CASE WHEN compaction_id IS NULL THEN NULL ELSE ${uuid('compaction_id')} END AS compaction_id FROM autocompact_decision`,
    ],
};
