import type { DatabaseSync } from 'node:sqlite';
import { importFacts } from '../import/import-facts.ts';
import type { Migration } from './migration.ts';

/** An id column as lowercase hex UUID text, as the other `_readable` views show it (001-views keeps its own copy: a released file is never edited). */
const uuid = (column: string): string =>
    `lower(substr(hex(${column}),1,8)||'-'||substr(hex(${column}),9,4)||'-'||substr(hex(${column}),13,4)||'-'||substr(hex(${column}),17,4)||'-'||substr(hex(${column}),21,12))`;

const SECTIONS = "'goal','now','needs','done','decisions','next','links','rules'";
const CLOSED = "'done','wrong','superseded','answered','merged','rewritten'";

const FACT = `CREATE TABLE fact (
  id         BLOB NOT NULL PRIMARY KEY CHECK (length(id) = 16),
  tab_id     TEXT NOT NULL REFERENCES tab(id) ON DELETE CASCADE,
  task_id    BLOB NOT NULL CHECK (length(task_id) = 16) REFERENCES task(id) ON DELETE CASCADE,
  section    TEXT NOT NULL CHECK (section IN (${SECTIONS})),
  text       TEXT NOT NULL CHECK (length(text) > 0),
  why        TEXT, ref TEXT, agent TEXT,
  first_at   INTEGER NOT NULL, last_at INTEGER NOT NULL CHECK (last_at >= first_at),
  state      TEXT NOT NULL CHECK (state IN ('open','closed')),
  closed_why TEXT CHECK (closed_why IN (${CLOSED})),
  closed_at  INTEGER,
  born_run   BLOB NOT NULL CHECK (length(born_run) = 16) REFERENCES run(id),
  last_run   BLOB NOT NULL CHECK (length(last_run) = 16) REFERENCES run(id),
  language   TEXT NOT NULL,
  CHECK ((state = 'closed') = (closed_at IS NOT NULL)),
  CHECK ((state = 'closed') = (closed_why IS NOT NULL)),
  CHECK (section <> 'decisions' OR why IS NOT NULL)
) STRICT, WITHOUT ROWID`;

/** Every foreign key leads an index: the cascades and the retention deletes find their children without a scan. */
const INDEXES = [
    'CREATE INDEX fact_by_task ON fact(task_id, state, section, last_at)',
    'CREATE INDEX fact_by_tab ON fact(tab_id)',
    'CREATE INDEX fact_by_born_run ON fact(born_run)',
    'CREATE INDEX fact_by_last_run ON fact(last_run)',
];

const FACT_TURN = `CREATE TABLE fact_turn (
  fact_id       BLOB NOT NULL CHECK (length(fact_id) = 16) REFERENCES fact(id) ON DELETE CASCADE,
  transcript_id BLOB NOT NULL CHECK (length(transcript_id) = 16) REFERENCES transcript(id) ON DELETE CASCADE,
  at            INTEGER NOT NULL,
  PRIMARY KEY (fact_id, transcript_id, at)
) STRICT, WITHOUT ROWID`;

const READABLE = `CREATE VIEW fact_readable AS SELECT ${uuid('id')} AS id, tab_id, ${uuid('task_id')} AS task_id, section, text, why, ref, agent, first_at, last_at, state, closed_why, closed_at FROM fact`;

/** Migration 6: the ledger of facts (`fact`, `fact_turn`) and the import of the 1.x items into it. The `item` rows stay, no longer written, until a later release drops them. */
export const m006: Migration = {
    version: 6,
    name: 'ledger',
    up: (db: DatabaseSync): void => {
        for (const statement of [FACT, ...INDEXES, FACT_TURN, 'CREATE INDEX fact_turn_by_transcript ON fact_turn(transcript_id)', READABLE, "CREATE VIEW open_facts AS SELECT * FROM fact WHERE state = 'open'"]) {
            db.exec(statement);
        }
        importFacts(db);
    },
};
