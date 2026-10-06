-- tab-recap database, schema version 1, as released in 1.6.0. FROZEN: never regenerate or edit. A change to the schema is a new numbered migration.
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
CREATE INDEX boundary_by_replaced ON boundary(replaces_id);
CREATE INDEX boundary_by_transcript ON boundary(transcript_id);
CREATE TABLE chapter (
  id BLOB NOT NULL PRIMARY KEY CHECK (length(id) = 16),
  tab_id TEXT NOT NULL REFERENCES tab(id) ON DELETE CASCADE,
  n INTEGER NOT NULL CHECK (n >= 1),
  started_at INTEGER NOT NULL,
  UNIQUE (tab_id, n)
) STRICT, WITHOUT ROWID;
CREATE TABLE column_state (id INTEGER PRIMARY KEY CHECK (id = 1),
  all_hidden INTEGER NOT NULL CHECK (all_hidden IN (0,1))) STRICT;
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
CREATE TABLE lane (
  tab_id      TEXT    NOT NULL REFERENCES tab(id) ON DELETE CASCADE,
  pane        TEXT    NOT NULL,
  position    INTEGER NOT NULL,
  agent       TEXT    NOT NULL,
  status      TEXT    NOT NULL,
  title       TEXT,
  cwd         TEXT,
  last_prompt TEXT,
  PRIMARY KEY (tab_id, pane)
) STRICT, WITHOUT ROWID;
CREATE TABLE request (
  id     BLOB    NOT NULL PRIMARY KEY CHECK (length(id) = 16),
  at     INTEGER NOT NULL,
  kind   TEXT    NOT NULL CHECK (kind IN ('refresh','visibility')),
  target TEXT    NOT NULL,
  hidden TEXT    CHECK (hidden IN ('hide','show','toggle')),
  CHECK ((kind = 'visibility') = (hidden IS NOT NULL))
) STRICT, WITHOUT ROWID;
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
CREATE TABLE store_meta (id INTEGER PRIMARY KEY CHECK (id = 1),
  files_imported_at INTEGER) STRICT;
CREATE TABLE tab (
  id             TEXT PRIMARY KEY,
  first_seen     INTEGER NOT NULL,
  last_seen      INTEGER NOT NULL,
  column_pane    TEXT,
  view_at        INTEGER,
  daemon_version TEXT,
  running        INTEGER NOT NULL DEFAULT 0 CHECK (running IN (0,1)),
  backend        TEXT,
  error          TEXT
) STRICT;
CREATE TABLE tab_visibility (
  tab_id TEXT PRIMARY KEY,
  state  TEXT NOT NULL CHECK (state IN ('hidden','shown'))) STRICT;
CREATE TABLE task (id BLOB NOT NULL PRIMARY KEY CHECK (length(id) = 16),
  tab_id TEXT NOT NULL REFERENCES tab(id) ON DELETE CASCADE,
  key TEXT NOT NULL, UNIQUE (tab_id, key)) STRICT, WITHOUT ROWID;
CREATE TABLE transcript (
  id          BLOB    NOT NULL PRIMARY KEY CHECK (length(id) = 16),
  tab_id      TEXT    NOT NULL REFERENCES tab(id) ON DELETE CASCADE,
  pane        TEXT    NOT NULL,
  agent       TEXT    NOT NULL,
  source      TEXT    NOT NULL,
  attached    INTEGER NOT NULL CHECK (attached IN (0,1)),
  position    INTEGER NOT NULL DEFAULT 0,
  cursor      INTEGER NOT NULL,
  tail        TEXT,
  title       TEXT,
  last_prompt TEXT,
  claude_note TEXT,
  first_seen  INTEGER NOT NULL,
  UNIQUE (tab_id, pane, source)
) STRICT, WITHOUT ROWID;
CREATE VIEW boundary_readable AS SELECT lower(substr(hex(id),1,8)||'-'||substr(hex(id),9,4)||'-'||substr(hex(id),13,4)||'-'||substr(hex(id),17,4)||'-'||substr(hex(id),21,12)) AS id, lower(substr(hex(chapter_id),1,8)||'-'||substr(hex(chapter_id),9,4)||'-'||substr(hex(chapter_id),13,4)||'-'||substr(hex(chapter_id),17,4)||'-'||substr(hex(chapter_id),21,12)) AS chapter_id, lower(substr(hex(transcript_id),1,8)||'-'||substr(hex(transcript_id),9,4)||'-'||substr(hex(transcript_id),13,4)||'-'||substr(hex(transcript_id),17,4)||'-'||substr(hex(transcript_id),21,12)) AS transcript_id, kind, at, trigger, cursor, CASE WHEN replaces_id IS NULL THEN NULL ELSE lower(substr(hex(replaces_id),1,8)||'-'||substr(hex(replaces_id),9,4)||'-'||substr(hex(replaces_id),13,4)||'-'||substr(hex(replaces_id),17,4)||'-'||substr(hex(replaces_id),21,12)) END AS replaces_id FROM boundary;
CREATE VIEW chapter_readable AS SELECT lower(substr(hex(id),1,8)||'-'||substr(hex(id),9,4)||'-'||substr(hex(id),13,4)||'-'||substr(hex(id),17,4)||'-'||substr(hex(id),21,12)) AS id, tab_id, n, started_at FROM chapter;
CREATE VIEW chapter_span AS
  SELECT c.id AS chapter_id, c.tab_id, c.n, c.started_at,
         LEAD(c.started_at) OVER (PARTITION BY c.tab_id ORDER BY c.n) AS sealed_at,
         COALESCE((SELECT group_concat(kind) FROM boundary b WHERE b.chapter_id = c.id), 'start') AS cause
  FROM chapter c;
CREATE VIEW last_good_run AS
  SELECT c.tab_id, MAX(r.id) AS run_id
  FROM run r JOIN chapter c ON c.id = r.chapter_id WHERE r.error IS NULL GROUP BY c.tab_id;
CREATE VIEW last_good_run_by_chapter AS
  SELECT chapter_id, MAX(id) AS run_id FROM run WHERE error IS NULL GROUP BY chapter_id;
CREATE VIEW request_readable AS SELECT lower(substr(hex(id),1,8)||'-'||substr(hex(id),9,4)||'-'||substr(hex(id),13,4)||'-'||substr(hex(id),17,4)||'-'||substr(hex(id),21,12)) AS id, at, kind, target, hidden FROM request;
CREATE VIEW run_readable AS SELECT lower(substr(hex(id),1,8)||'-'||substr(hex(id),9,4)||'-'||substr(hex(id),13,4)||'-'||substr(hex(id),17,4)||'-'||substr(hex(id),21,12)) AS id, lower(substr(hex(chapter_id),1,8)||'-'||substr(hex(chapter_id),9,4)||'-'||substr(hex(chapter_id),13,4)||'-'||substr(hex(chapter_id),17,4)||'-'||substr(hex(chapter_id),21,12)) AS chapter_id, at, cause, backend, language, cost_micro_usd, error FROM run;
CREATE VIEW task_readable AS SELECT lower(substr(hex(id),1,8)||'-'||substr(hex(id),9,4)||'-'||substr(hex(id),13,4)||'-'||substr(hex(id),17,4)||'-'||substr(hex(id),21,12)) AS id, tab_id, key FROM task;
CREATE VIEW transcript_readable AS SELECT lower(substr(hex(id),1,8)||'-'||substr(hex(id),9,4)||'-'||substr(hex(id),13,4)||'-'||substr(hex(id),17,4)||'-'||substr(hex(id),21,12)) AS id, tab_id, pane, agent, source, attached, position, cursor, tail, title, last_prompt, claude_note, first_seen FROM transcript;

INSERT INTO tab (id, first_seen, last_seen, column_pane, view_at, daemon_version, running, backend, error) VALUES ('w1:t1', 10, 20, 'w1:p9', 20, '1.6.0', 0, 'claude', NULL);
INSERT INTO lane (tab_id, pane, position, agent, status, title, cwd, last_prompt) VALUES ('w1:t1', 'w1:p1', 0, 'claude', 'idle', 'fixture', '/w', 'ship it');
INSERT INTO transcript (id, tab_id, pane, agent, source, attached, position, cursor, tail, title, last_prompt, claude_note, first_seen) VALUES (x'0188000000007000800000000000000a', 'w1:t1', 'w1:p1', 'claude', '/t/a.jsonl', 1, 0, 123, NULL, 'fixture', 'ship it', NULL, 10);
INSERT INTO chapter (id, tab_id, n, started_at) VALUES (x'0188000000007000800000000000000b', 'w1:t1', 1, 10);
INSERT INTO run (id, chapter_id, at, cause, backend, language, cost_micro_usd, error) VALUES (x'0188000000007000800000000000000c', x'0188000000007000800000000000000b', 20, 'imported', 'claude', 'en', 1500000, NULL);
INSERT INTO task (id, tab_id, key) VALUES (x'0188000000007000800000000000000d', 'w1:t1', 't1');
INSERT INTO run_task (run_id, task_id, position, name, legacy_markdown) VALUES (x'0188000000007000800000000000000c', x'0188000000007000800000000000000d', 0, NULL, NULL);
INSERT INTO run_task_lane (run_id, task_id, transcript_id, position) VALUES (x'0188000000007000800000000000000c', x'0188000000007000800000000000000d', x'0188000000007000800000000000000a', 0);
INSERT INTO item (run_id, task_id, view, section, position, text) VALUES (x'0188000000007000800000000000000c', x'0188000000007000800000000000000d', 'recap', 'goal', 0, 'keep the fixture readable');
INSERT INTO item (run_id, task_id, view, section, position, text) VALUES (x'0188000000007000800000000000000c', x'0188000000007000800000000000000d', 'recap', 'done', 0, 'wrote the schema');
ALTER TABLE lane ADD COLUMN web_base TEXT;
ALTER TABLE lane ADD COLUMN web_forge TEXT CHECK (web_forge IN ('gitlab','github'));
ALTER TABLE lane ADD COLUMN web_branch TEXT;
UPDATE lane SET web_base = 'https://git.example/team/app', web_forge = 'gitlab', web_branch = 'feat/x';
INSERT INTO request (id, at, kind, target) VALUES (x'0188000000007000800000000000000e', 5, 'refresh', 'w1:t1');
PRAGMA user_version = 2;
