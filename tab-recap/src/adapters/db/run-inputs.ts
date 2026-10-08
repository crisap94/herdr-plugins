// The RunInputs repository: the writer's document per run (gzip), the run's items (the facts it added) and its gate counts. Written inside the run's transaction by `RunRows`.
import { gunzipSync, gzipSync } from 'node:zlib';
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { ItemsMode, RunInputs, RunItem, RunQuery, StoredRun } from '#src/ports/run-inputs.ts';
import type { GateStats } from '#src/recap/domain/gates/index.ts';
import { all, blob, flag, guarded, maybeText, text, whole } from './rows.ts';
import type { Row } from './rows.ts';
import { idOf, typeIdOf } from './typeid.ts';

/** What the run row keeps of the gates: JSON, or null. */
export const statsText = (stats: GateStats | null): string | null => (stats === null ? null : JSON.stringify(stats));

const counts = (value: unknown): Record<string, number> =>
    typeof value === 'object' && value !== null ? Object.fromEntries(Object.entries(value).flatMap(([gate, n]) => (typeof n === 'number' ? [[gate, n]] : []))) : {};

function statsOf(raw: string | null): GateStats | null {
    if (raw === null) {
        return null;
    }
    const found: unknown = JSON.parse(raw);
    const fields = typeof found === 'object' && found !== null ? (found as Record<string, unknown>) : {};
    return { refused: counts(fields['refused']), flagged: counts(fields['flagged']), dropped: typeof fields['dropped'] === 'number' ? fields['dropped'] : 0 };
}

/** The statements of the write side, used by `RunRows` inside `recordRun`. */
export class RunInputRows {
    private readonly insert: StatementSync;

    constructor(db: DatabaseSync) {
        this.insert = db.prepare('INSERT INTO run_input (run_id, document, bytes) VALUES (?, ?, ?)');
    }

    put(run: Uint8Array, document: string): void {
        this.insert.run(run, gzipSync(document), Buffer.byteLength(document));
    }
}

const RUNS = `SELECT r.id, c.tab_id, r.at, r.language, r.backend, r.gate_stats, i.run_id IS NOT NULL AS has_input
  FROM run r JOIN chapter c ON c.id = r.chapter_id LEFT JOIN run_input i ON i.run_id = r.id
  WHERE EXISTS (SELECT 1 FROM fact WHERE born_run = r.id) AND (?1 IS NULL OR c.tab_id = ?1) AND r.at >= ?2 AND (?3 = 0 OR i.run_id IS NOT NULL)
  ORDER BY r.id DESC LIMIT ?4`;

const SECTION_ORDER = "CASE f.section WHEN 'goal' THEN 0 WHEN 'now' THEN 1 WHEN 'needs' THEN 2 WHEN 'done' THEN 3 WHEN 'decisions' THEN 4 WHEN 'next' THEN 5 WHEN 'links' THEN 6 ELSE 7 END";
const COLUMNS = `t.key AS task, f.section, f.text, f.id AS fact, f.anchor, f.born_run = ?1 AS born, ROW_NUMBER() OVER (PARTITION BY f.task_id, f.section ORDER BY f.id) - 1 AS position`;

/** A run's added items are the facts it created (its `add` operations): updates and closes change what is already there. The position counts within the task and section. */
const ADDED = `SELECT ${COLUMNS} FROM fact f JOIN task t ON t.id = f.task_id LEFT JOIN run_task rt ON rt.run_id = f.born_run AND rt.task_id = f.task_id
  WHERE f.born_run = ?1
  ORDER BY COALESCE(rt.position, 0), ${SECTION_ORDER}, f.id`;

/** The state after a run: the tab's facts created by it or before it that were not closed by then (a fact closed by the run itself is not in it). The text is the fact's latest wording. */
const STATE = `SELECT ${COLUMNS} FROM fact f JOIN task t ON t.id = f.task_id
  WHERE f.tab_id = (SELECT c.tab_id FROM run r JOIN chapter c ON c.id = r.chapter_id WHERE r.id = ?1)
    AND f.born_run <= ?1 AND (f.closed_at IS NULL OR f.closed_at > (SELECT at FROM run WHERE id = ?1))
  ORDER BY t.key, ${SECTION_ORDER}, f.id`;

const storedRun = (row: Row): StoredRun => ({
    id: typeIdOf('run', blob(row, 'id')), tab: text(row, 'tab_id'), at: whole(row, 'at'), language: text(row, 'language'),
    backend: maybeText(row, 'backend'), hasInput: flag(row, 'has_input'), gateStats: statsOf(maybeText(row, 'gate_stats')),
});

const itemOf = (row: Row, prefix: string): RunItem => ({
    key: `${prefix}${text(row, 'task')}/${text(row, 'section')}/${whole(row, 'position')}`, section: text(row, 'section'), text: text(row, 'text'),
    fact: typeIdOf('fact', blob(row, 'fact')), born: flag(row, 'born'), anchor: maybeText(row, 'anchor'),
});

export class RunInputsRepository implements RunInputs {
    private readonly runsSelect: StatementSync;
    private readonly documentSelect: StatementSync;
    private readonly addedSelect: StatementSync;
    private readonly stateSelect: StatementSync;
    private readonly gatesSelect: StatementSync;
    private readonly remove: StatementSync;

    constructor(db: DatabaseSync) {
        this.runsSelect = db.prepare(RUNS);
        this.documentSelect = db.prepare('SELECT document FROM run_input WHERE run_id = ?');
        this.addedSelect = db.prepare(ADDED);
        this.stateSelect = db.prepare(STATE);
        this.gatesSelect = db.prepare('SELECT at, gate_stats FROM run WHERE gate_stats IS NOT NULL AND at >= ? ORDER BY id DESC');
        this.remove = db.prepare('DELETE FROM run_input WHERE run_id IN (SELECT id FROM run WHERE at < ?)');
    }

    runs(query: RunQuery): readonly StoredRun[] {
        return guarded(() => all(this.runsSelect, query.tab, query.since ?? 0, query.withInput ? 1 : 0, query.limit).map(storedRun), []);
    }

    document(run: string): string | null {
        const id = idOf('run', run);
        const row = id === null ? undefined : this.documentSelect.get(id);
        const packed = row === undefined ? null : row['document'];
        return guarded(() => (packed instanceof Uint8Array ? gunzipSync(packed).toString('utf8') : null), null);
    }

    itemsOf(run: string, mode: ItemsMode): readonly RunItem[] {
        const id = idOf('run', run);
        const [select, prefix] = mode === 'state' ? [this.stateSelect, 'state/'] : [this.addedSelect, ''];
        return id === null ? [] : guarded(() => all(select, id).map((row) => itemOf(row, prefix)), []);
    }

    gateCounts(since: number | null): readonly { readonly at: number; readonly stats: GateStats }[] {
        return guarded(() => all(this.gatesSelect, since ?? 0).flatMap((row) => {
            const stats = statsOf(maybeText(row, 'gate_stats'));
            return stats === null ? [] : [{ at: whole(row, 'at'), stats }];
        }), []);
    }

    prune(before: number): number {
        return Number(this.remove.run(before).changes);
    }
}
