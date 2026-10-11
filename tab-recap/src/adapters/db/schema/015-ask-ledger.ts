import type { Migration } from './migration.ts';

export const m015: Migration = {
    version: 15,
    name: 'ask-ledger',
    up: [
        `CREATE TABLE ask (
  exchange  TEXT    NOT NULL CHECK (length(exchange) BETWEEN 1 AND 16),
  requester TEXT    NOT NULL CHECK (length(requester) BETWEEN 1 AND 32),
  id        TEXT    NOT NULL CHECK (length(id) BETWEEN 1 AND 16),
  pane      TEXT    NOT NULL,
  at        INTEGER NOT NULL,
  ref       TEXT,
  outcome   TEXT,
  PRIMARY KEY (exchange, requester, id)
) STRICT, WITHOUT ROWID`,
        "INSERT INTO ask (exchange, requester, id, pane, at, ref, outcome) SELECT 'compact', tool, id, pane, at, NULL, 'settled' FROM compact_ask",
        'DROP TABLE compact_ask',
    ],
};
