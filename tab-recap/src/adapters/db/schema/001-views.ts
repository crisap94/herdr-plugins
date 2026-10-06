/** An id column as lowercase hex UUID text (8-4-4-4-12), for whoever reads the file with `sqlite3`. */
const text = (column: string): string =>
    `lower(substr(hex(${column}),1,8)||'-'||substr(hex(${column}),9,4)||'-'||substr(hex(${column}),13,4)||'-'||substr(hex(${column}),17,4)||'-'||substr(hex(${column}),21,12))`;

/** `<table>_readable`: the table's columns, its id and id references as UUID text. */
function readable(table: string, ids: readonly string[], others: readonly string[]): string {
    const columns = [...ids.map((id) => `${text(id)} AS ${id}`), ...others].join(', ');
    return `CREATE VIEW ${table}_readable AS SELECT ${columns} FROM ${table};`;
}

const READABLE = [
    readable('transcript', ['id'], ['tab_id', 'pane', 'agent', 'source', 'attached', 'position', 'cursor', 'tail', 'title', 'last_prompt', 'claude_note', 'first_seen']),
    readable('chapter', ['id'], ['tab_id', 'n', 'started_at']),
    readable('boundary', ['id', 'chapter_id', 'transcript_id'], ['kind', 'at', 'trigger', 'cursor', `CASE WHEN replaces_id IS NULL THEN NULL ELSE ${text('replaces_id')} END AS replaces_id`]),
    readable('task', ['id'], ['tab_id', 'key']),
    readable('run', ['id', 'chapter_id'], ['at', 'cause', 'backend', 'language', 'cost_micro_usd', 'error']),
    readable('request', ['id'], ['at', 'kind', 'target', 'hidden']),
].join('\n');

/** Derived, never stored: a chapter's end and cause, the last run that wrote a recap (per chapter and per tab), and the readable ids. */
export const VIEWS = `
CREATE VIEW chapter_span AS
  SELECT c.id AS chapter_id, c.tab_id, c.n, c.started_at,
         LEAD(c.started_at) OVER (PARTITION BY c.tab_id ORDER BY c.n) AS sealed_at,
         COALESCE((SELECT group_concat(kind) FROM boundary b WHERE b.chapter_id = c.id), 'start') AS cause
  FROM chapter c;

CREATE VIEW last_good_run_by_chapter AS
  SELECT chapter_id, MAX(id) AS run_id FROM run WHERE error IS NULL GROUP BY chapter_id;

CREATE VIEW last_good_run AS
  SELECT c.tab_id, MAX(r.id) AS run_id
  FROM run r JOIN chapter c ON c.id = r.chapter_id WHERE r.error IS NULL GROUP BY c.tab_id;

${READABLE}
`;
