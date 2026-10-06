// Migration 1, live state (ids are UUIDv7 as 16 bytes, see ../uuid7.ts): what the columns draw and the daemon is asked. STRICT, so a bug cannot store a shape the renderer does not know.
export const LIVE = `
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

CREATE TABLE column_state (id INTEGER PRIMARY KEY CHECK (id = 1),
  all_hidden INTEGER NOT NULL CHECK (all_hidden IN (0,1))) STRICT;
CREATE TABLE tab_visibility (
  tab_id TEXT PRIMARY KEY,
  state  TEXT NOT NULL CHECK (state IN ('hidden','shown'))) STRICT;

CREATE TABLE request (
  id     BLOB    NOT NULL PRIMARY KEY CHECK (length(id) = 16),
  at     INTEGER NOT NULL,
  kind   TEXT    NOT NULL CHECK (kind IN ('refresh','visibility')),
  target TEXT    NOT NULL,
  hidden TEXT    CHECK (hidden IN ('hide','show','toggle')),
  CHECK ((kind = 'visibility') = (hidden IS NOT NULL))
) STRICT, WITHOUT ROWID;

CREATE TABLE store_meta (id INTEGER PRIMARY KEY CHECK (id = 1),
  files_imported_at INTEGER) STRICT;
INSERT INTO store_meta (id, files_imported_at) VALUES (1, NULL);
`;
