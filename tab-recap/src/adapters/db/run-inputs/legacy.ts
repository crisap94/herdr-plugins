import type { Database } from 'bun:sqlite';
import { gzipSync } from 'node:zlib';
import type { GateCount, ItemsMode, RunInputs, RunItem, RunQuery, StoredRun } from '#src/ports/run-inputs.ts';
import type { RunEntry, RunRecord } from '#src/ports/run-inputs.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import type { GateStats } from '#src/recap/domain/gates/index.ts';
import { parseRunId } from '#src/recap/domain/run-ids.ts';
import { parseTabId } from '#src/recap/domain/ids.ts';
import { instant } from '#src/recap/domain/time.ts';
import { runInput } from '../drizzle/index.ts';
import { ormOf, type Orm } from '../orm.ts';
import { guarded } from '../rows.ts';
import { RunInputStore } from '../run-inputs.ts';

export const statsText = (stats: GateStats | null): string | null => (stats === null ? null : JSON.stringify(stats));

export class RunInputRows {
    private readonly orm: Orm;

    constructor(db: Database) {
        this.orm = ormOf(db);
    }

    put(run: Uint8Array, document: string): void {
        this.orm.insert(runInput).values({ runId: run, document: gzipSync(document), bytes: Buffer.byteLength(document) }).run();
    }
}

const storedRunOf = (run: RunRecord): StoredRun => ({
    id: run.id, tab: run.tab, at: run.at, language: run.language, backend: run.backend, hasInput: run.input === 'present', gateStats: run.gateStats,
});

const runItemOf = (entry: RunEntry): RunItem => ({
    key: entry.key, section: entry.section, text: entry.text, fact: entry.fact, born: entry.birth === 'born', anchor: entry.anchor,
});

export class RunInputsRepository implements RunInputs {
    private readonly store: RunInputStore;

    constructor(db: Database) {
        this.store = new RunInputStore(db);
    }

    runs(query: RunQuery): readonly StoredRun[] {
        return guarded(() => this.store.runs({
            tab: query.tab === null ? null : must(parseTabId(query.tab)),
            since: query.since === null ? null : instant(query.since),
            limit: must(parseCount(query.limit)),
            input: query.withInput ? 'with-input' : 'any',
        }).map(storedRunOf), []);
    }

    document(run: string): string | null {
        const id = parseRunId(run);
        return id.kind === 'ok' ? this.store.document(id.value) : null;
    }

    itemsOf(run: string, mode: ItemsMode): readonly RunItem[] {
        const id = parseRunId(run);
        return id.kind === 'ok' ? this.store.itemsOf(id.value, mode).map(runItemOf) : [];
    }

    gateCounts(since: number | null): readonly GateCount[] {
        return this.store.gateCounts(since === null ? null : instant(since)).map((tally) => ({ at: tally.at, stats: tally.stats }));
    }

    prune(before: number): number {
        return this.store.prune(instant(before));
    }
}
