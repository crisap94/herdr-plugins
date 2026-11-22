import type { Database } from 'bun:sqlite';
import { gunzipSync } from 'node:zlib';
import { and, desc, eq, gte, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import type { RunId } from '#src/recap/domain/run-ids.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { parseGateTally, parseRunEntry, parseRunRecord, type GateTally, type ItemsMode, type RunEntry, type RunFilter, type RunInputReader, type RunRecord } from '#src/ports/run-inputs.ts';
import { run as runs, runInput } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { blob, flag, guarded, maybeText, text, whole } from './rows.ts';
import { idOf, typeIdOf } from './typeid.ts';

const SECTION_ORDER = sql.raw("CASE f.section WHEN 'goal' THEN 0 WHEN 'now' THEN 1 WHEN 'needs' THEN 2 WHEN 'done' THEN 3 WHEN 'decisions' THEN 4 WHEN 'next' THEN 5 WHEN 'links' THEN 6 ELSE 7 END");

type EntryPrefix = '' | 'state/';

export class RunInputStore implements RunInputReader {
    private readonly orm: Orm;

    constructor(db: Database) {
        this.orm = ormOf(db);
    }

    runs(query: RunFilter): readonly RunRecord[] {
        const tab = query.tab;
        const since = query.since ?? instant(0);
        const withInput = query.input === 'with-input' ? 1 : 0;
        return guarded(() => this.orm.all<Record<string, unknown>>(sql`SELECT r.id, c.tab_id, r.at, r.language, r.backend, r.gate_stats, i.run_id IS NOT NULL AS has_input
          FROM run r JOIN chapter c ON c.id = r.chapter_id LEFT JOIN run_input i ON i.run_id = r.id
          WHERE EXISTS (SELECT 1 FROM fact WHERE born_run = r.id) AND (${tab} IS NULL OR c.tab_id = ${tab}) AND r.at >= ${since} AND (${withInput} = 0 OR i.run_id IS NOT NULL)
          ORDER BY r.id DESC LIMIT ${query.limit}`).map((row) => {
            const gateStats: unknown = typeof row['gate_stats'] === 'string' ? JSON.parse(row['gate_stats']) : null;
            return must(parseRunRecord({
                id: typeIdOf('run', blob(row, 'id')), tab: text(row, 'tab_id'), at: whole(row, 'at'), language: text(row, 'language'),
                backend: maybeText(row, 'backend'), input: flag(row, 'has_input') ? 'present' : 'absent', gateStats,
            }));
        }), []);
    }

    document(run: RunId): Text | null {
        const id = idOf('run', run);
        const row = id === null ? undefined : this.orm.select({ document: runInput.document }).from(runInput).where(eq(runInput.runId, id)).get();
        const packed = row?.document ?? null;
        return guarded(() => (packed instanceof Uint8Array ? must(parseText(gunzipSync(packed).toString('utf8'))) : null), null);
    }

    itemsOf(run: RunId, mode: ItemsMode): readonly RunEntry[] {
        const id = idOf('run', run);
        if (id === null) {
            return [];
        }
        const prefix: EntryPrefix = mode === 'state' ? 'state/' : '';
        const rows = mode === 'state'
            ? sql`SELECT t.key AS task, f.section, f.text, f.id AS fact, f.anchor, f.born_run = ${id} AS born, ROW_NUMBER() OVER (PARTITION BY f.task_id, f.section ORDER BY f.id) - 1 AS position
          FROM fact f JOIN task t ON t.id = f.task_id
          WHERE f.tab_id = (SELECT c.tab_id FROM run r JOIN chapter c ON c.id = r.chapter_id WHERE r.id = ${id})
            AND f.born_run <= ${id} AND (f.closed_at IS NULL OR f.closed_at > (SELECT at FROM run WHERE id = ${id}))
          ORDER BY t.key, ${SECTION_ORDER}, f.id`
            : sql`SELECT t.key AS task, f.section, f.text, f.id AS fact, f.anchor, f.born_run = ${id} AS born, ROW_NUMBER() OVER (PARTITION BY f.task_id, f.section ORDER BY f.id) - 1 AS position
          FROM fact f JOIN task t ON t.id = f.task_id LEFT JOIN run_task rt ON rt.run_id = f.born_run AND rt.task_id = f.task_id
          WHERE f.born_run = ${id}
          ORDER BY COALESCE(rt.position, 0), ${SECTION_ORDER}, f.id`;
        return guarded(() => this.orm.all<Record<string, unknown>>(rows).map((row) => must(parseRunEntry({
            key: `${prefix}${text(row, 'task')}/${text(row, 'section')}/${whole(row, 'position')}`, section: text(row, 'section'), text: text(row, 'text'),
            fact: typeIdOf('fact', blob(row, 'fact')), birth: flag(row, 'born') ? 'born' : 'carried', anchor: maybeText(row, 'anchor'),
        }))), []);
    }

    gateCounts(since: Instant | null): readonly GateTally[] {
        return guarded(() => this.orm.select({ at: runs.at, gate_stats: runs.gateStats }).from(runs)
            .where(and(isNotNull(runs.gateStats), gte(runs.at, since ?? instant(0)))).orderBy(desc(runs.id)).all()
            .map((row) => {
                const stats: unknown = typeof row.gate_stats === 'string' ? JSON.parse(row.gate_stats) : null;
                return must(parseGateTally({ at: row.at, stats }));
            }), []);
    }

    prune(before: Instant): Count {
        const removed = this.orm.delete(runInput).where(inArray(runInput.runId, this.orm.select({ id: runs.id }).from(runs).where(lt(runs.at, before))))
            .returning({ runId: runInput.runId }).all().length;
        return must(parseCount(removed));
    }
}
