import { gunzipSync, gzipSync } from 'node:zlib';
import type { Database } from 'bun:sqlite';
import { and, desc, eq, gte, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import type { ItemsMode, RunInputs, RunItem, RunQuery, StoredRun } from '#src/ports/run-inputs.ts';
import type { GateStats } from '#src/recap/domain/gates/index.ts';
import { run as runs, runInput } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { blob, flag, guarded, maybeText, text, whole } from './rows.ts';
import type { Row } from './rows.ts';
import { idOf, typeIdOf } from './typeid.ts';

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

export class RunInputRows {
    private readonly orm: Orm;

    constructor(db: Database) {
        this.orm = ormOf(db);
    }

    put(run: Uint8Array, document: string): void {
        this.orm.insert(runInput).values({ runId: run, document: gzipSync(document), bytes: Buffer.byteLength(document) }).run();
    }
}

const SECTION_ORDER = sql.raw("CASE f.section WHEN 'goal' THEN 0 WHEN 'now' THEN 1 WHEN 'needs' THEN 2 WHEN 'done' THEN 3 WHEN 'decisions' THEN 4 WHEN 'next' THEN 5 WHEN 'links' THEN 6 ELSE 7 END");

const storedRun = (row: Row): StoredRun => ({
    id: typeIdOf('run', blob(row, 'id')), tab: text(row, 'tab_id'), at: whole(row, 'at'), language: text(row, 'language'),
    backend: maybeText(row, 'backend'), hasInput: flag(row, 'has_input'), gateStats: statsOf(maybeText(row, 'gate_stats')),
});

const itemOf = (row: Row, prefix: string): RunItem => ({
    key: `${prefix}${text(row, 'task')}/${text(row, 'section')}/${whole(row, 'position')}`, section: text(row, 'section'), text: text(row, 'text'),
    fact: typeIdOf('fact', blob(row, 'fact')), born: flag(row, 'born'), anchor: maybeText(row, 'anchor'),
});

export class RunInputsRepository implements RunInputs {
    private readonly orm: Orm;

    constructor(db: Database) {
        this.orm = ormOf(db);
    }

    runs(query: RunQuery): readonly StoredRun[] {
        const tab = query.tab;
        const since = query.since ?? 0;
        const withInput = query.withInput ? 1 : 0;
        return guarded(() => this.orm.all<Row>(sql`SELECT r.id, c.tab_id, r.at, r.language, r.backend, r.gate_stats, i.run_id IS NOT NULL AS has_input
          FROM run r JOIN chapter c ON c.id = r.chapter_id LEFT JOIN run_input i ON i.run_id = r.id
          WHERE EXISTS (SELECT 1 FROM fact WHERE born_run = r.id) AND (${tab} IS NULL OR c.tab_id = ${tab}) AND r.at >= ${since} AND (${withInput} = 0 OR i.run_id IS NOT NULL)
          ORDER BY r.id DESC LIMIT ${query.limit}`).map(storedRun), []);
    }

    document(run: string): string | null {
        const id = idOf('run', run);
        const row = id === null ? undefined : this.orm.select({ document: runInput.document }).from(runInput).where(eq(runInput.runId, id)).get();
        const packed = row?.document ?? null;
        return guarded(() => (packed instanceof Uint8Array ? gunzipSync(packed).toString('utf8') : null), null);
    }

    itemsOf(run: string, mode: ItemsMode): readonly RunItem[] {
        const id = idOf('run', run);
        if (id === null) {
            return [];
        }
        return guarded(() => (mode === 'state'
            ? this.orm.all<Row>(sql`SELECT t.key AS task, f.section, f.text, f.id AS fact, f.anchor, f.born_run = ${id} AS born, ROW_NUMBER() OVER (PARTITION BY f.task_id, f.section ORDER BY f.id) - 1 AS position
          FROM fact f JOIN task t ON t.id = f.task_id
          WHERE f.tab_id = (SELECT c.tab_id FROM run r JOIN chapter c ON c.id = r.chapter_id WHERE r.id = ${id})
            AND f.born_run <= ${id} AND (f.closed_at IS NULL OR f.closed_at > (SELECT at FROM run WHERE id = ${id}))
          ORDER BY t.key, ${SECTION_ORDER}, f.id`).map((row) => itemOf(row, 'state/'))
            : this.orm.all<Row>(sql`SELECT t.key AS task, f.section, f.text, f.id AS fact, f.anchor, f.born_run = ${id} AS born, ROW_NUMBER() OVER (PARTITION BY f.task_id, f.section ORDER BY f.id) - 1 AS position
          FROM fact f JOIN task t ON t.id = f.task_id LEFT JOIN run_task rt ON rt.run_id = f.born_run AND rt.task_id = f.task_id
          WHERE f.born_run = ${id}
          ORDER BY COALESCE(rt.position, 0), ${SECTION_ORDER}, f.id`).map((row) => itemOf(row, ''))), []);
    }

    gateCounts(since: number | null): readonly { readonly at: number; readonly stats: GateStats }[] {
        return guarded(() => this.orm.select({ at: runs.at, gate_stats: runs.gateStats }).from(runs)
            .where(and(isNotNull(runs.gateStats), gte(runs.at, since ?? 0))).orderBy(desc(runs.id)).all().flatMap((row) => {
                const stats = statsOf(row.gate_stats);
                return stats === null ? [] : [{ at: row.at, stats }];
            }), []);
    }

    prune(before: number): number {
        return this.orm.delete(runInput).where(inArray(runInput.runId, this.orm.select({ id: runs.id }).from(runs).where(lt(runs.at, before))))
            .returning({ runId: runInput.runId }).all().length;
    }
}
