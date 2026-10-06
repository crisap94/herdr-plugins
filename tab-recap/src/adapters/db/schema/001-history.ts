// Migration 1, history (entity ids are UUIDv7 as 16 bytes; `at`/`started_at` stay columns, the id carries only its creation time): chapter → run → task → item. 1.6.0 fills chapter 1 and the `recap` view; `boundary` and the `story` view wait for 1.7.0.
export const HISTORY = `
CREATE TABLE chapter (
  id BLOB NOT NULL PRIMARY KEY CHECK (length(id) = 16),
  tab_id TEXT NOT NULL REFERENCES tab(id) ON DELETE CASCADE,
  n INTEGER NOT NULL CHECK (n >= 1),
  started_at INTEGER NOT NULL,
  UNIQUE (tab_id, n)
) STRICT, WITHOUT ROWID;

CREATE TABLE boundary (
  id            BLOB    NOT NULL PRIMARY KEY CHECK (length(id) = 16),
  chapter_id    BLOB    NOT NULL CHECK (length(chapter_id) = 16) REFERENCES chapter(id) ON DELETE CASCADE,
  transcript_id BLOB    NOT NULL CHECK (length(transcript_id) = 16) REFERENCES transcript(id) ON DELETE CASCADE,
  kind          TEXT    NOT NULL CHECK (kind IN ('compacted','switched','rewritten')),
  at            INTEGER NOT NULL,
  trigger       TEXT    CHECK (trigger IN ('auto','manual')),
  cursor        INTEGER NOT NULL,
  replaces_id   BLOB    CHECK (replaces_id IS NULL OR length(replaces_id) = 16) REFERENCES transcript(id) ON DELETE SET NULL,
  CHECK (kind = 'switched'  OR replaces_id IS NULL),
  CHECK (kind = 'compacted' OR trigger IS NULL)
) STRICT, WITHOUT ROWID;
CREATE INDEX boundary_by_chapter ON boundary(chapter_id);
CREATE INDEX boundary_by_transcript ON boundary(transcript_id);
CREATE INDEX boundary_by_replaced ON boundary(replaces_id);

CREATE TABLE task (id BLOB NOT NULL PRIMARY KEY CHECK (length(id) = 16),
  tab_id TEXT NOT NULL REFERENCES tab(id) ON DELETE CASCADE,
  key TEXT NOT NULL, UNIQUE (tab_id, key)) STRICT, WITHOUT ROWID;

CREATE TABLE run (
  id         BLOB    NOT NULL PRIMARY KEY CHECK (length(id) = 16),
  chapter_id BLOB    NOT NULL CHECK (length(chapter_id) = 16) REFERENCES chapter(id) ON DELETE CASCADE,
  at         INTEGER NOT NULL,
  cause      TEXT NOT NULL CHECK (cause IN ('turn-ended','focused','requested','imported')),
  backend    TEXT,
  language   TEXT NOT NULL,
  cost_micro_usd INTEGER NOT NULL DEFAULT 0 CHECK (cost_micro_usd >= 0),
  error      TEXT
) STRICT, WITHOUT ROWID;
CREATE INDEX run_by_chapter ON run(chapter_id, id);

CREATE TABLE run_read (run_id BLOB NOT NULL CHECK (length(run_id) = 16) REFERENCES run(id) ON DELETE CASCADE,
  transcript_id BLOB NOT NULL CHECK (length(transcript_id) = 16) REFERENCES transcript(id) ON DELETE CASCADE,
  from_cursor INTEGER NOT NULL, to_cursor INTEGER NOT NULL,
  PRIMARY KEY (run_id, transcript_id)) STRICT, WITHOUT ROWID;
CREATE INDEX run_read_by_transcript ON run_read(transcript_id);

CREATE TABLE run_task (run_id BLOB NOT NULL CHECK (length(run_id) = 16) REFERENCES run(id) ON DELETE CASCADE,
  task_id BLOB NOT NULL CHECK (length(task_id) = 16) REFERENCES task(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  name TEXT,
  legacy_markdown TEXT,
  PRIMARY KEY (run_id, task_id)) STRICT, WITHOUT ROWID;
CREATE INDEX run_task_by_task ON run_task(task_id);

CREATE TABLE run_task_lane (run_id BLOB NOT NULL CHECK (length(run_id) = 16), task_id BLOB NOT NULL CHECK (length(task_id) = 16),
  transcript_id BLOB NOT NULL CHECK (length(transcript_id) = 16),
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (run_id, task_id, transcript_id),
  FOREIGN KEY (run_id, task_id) REFERENCES run_task(run_id, task_id) ON DELETE CASCADE,
  FOREIGN KEY (transcript_id) REFERENCES transcript(id) ON DELETE CASCADE) STRICT, WITHOUT ROWID;
CREATE INDEX run_task_lane_by_transcript ON run_task_lane(transcript_id);

CREATE TABLE item (
  run_id BLOB NOT NULL CHECK (length(run_id) = 16), task_id BLOB NOT NULL CHECK (length(task_id) = 16),
  view     TEXT NOT NULL CHECK (view IN ('recap','story')),
  section  TEXT NOT NULL CHECK (section IN ('goal','now','needs','done','decisions','next','links')),
  position INTEGER NOT NULL CHECK (position >= 0),
  text     TEXT NOT NULL CHECK (length(text) > 0),
  PRIMARY KEY (run_id, task_id, view, section, position),
  FOREIGN KEY (run_id, task_id) REFERENCES run_task(run_id, task_id) ON DELETE CASCADE,
  CHECK (view = 'recap' OR section IN ('goal','done','decisions','links')),
  CHECK (position < CASE
    WHEN section = 'goal' THEN 1
    WHEN view = 'story' AND section = 'done'      THEN 15
    WHEN view = 'story' AND section = 'decisions' THEN 10
    WHEN view = 'story' AND section = 'links'     THEN 12
    WHEN section IN ('now','needs','decisions')   THEN 3
    WHEN section = 'links' THEN 6 ELSE 5 END)
) STRICT, WITHOUT ROWID;
`;
