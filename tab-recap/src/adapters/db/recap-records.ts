import type { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import type { Advance, FailedRun, LastRun, RecapRecords, RecordedRun, TabRecap } from '#src/ports/recap-records.ts';
import type { FactId, RunId } from '#src/recap/domain/fact.ts';
import { RECAP_CAUSES } from '#src/recap/domain/intent.ts';
import type { RecapCause } from '#src/recap/domain/intent.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { lastGoodRun, run as runs, tab as tabs } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { BoundaryRows } from './boundaries.ts';
import { writeTx } from './connection.ts';
import { LedgerRows } from './ledger-rows.ts';
import { RecapReader } from './recap-read.ts';
import { guarded } from './rows.ts';
import { RunRows } from './run-write.ts';
import { TabRow } from './tab-row.ts';
import { TranscriptRows } from './transcripts.ts';
import { typeIdOf } from './typeid.ts';
import { ids } from './uuid7.ts';

const causeOf = (raw: string): RecapCause | 'imported' | null => (raw === 'imported' ? 'imported' : RECAP_CAUSES.find((cause) => cause === raw) ?? null);

export class RecapRecordsRepository implements RecapRecords {
    private readonly db: Database;
    private readonly reader: RecapReader;
    private readonly tabs: TabRow;
    private readonly transcripts: TranscriptRows;
    private readonly runs: RunRows;
    private readonly ledger: LedgerRows;
    private readonly boundaries: BoundaryRows;
    private readonly orm: Orm;

    constructor(db: Database) {
        this.db = db;
        this.orm = ormOf(db);
        this.ledger = new LedgerRows(db);
        this.reader = new RecapReader(db, this.ledger);
        this.tabs = new TabRow(db);
        this.transcripts = new TranscriptRows(db);
        this.runs = new RunRows(db, this.transcripts);
        this.boundaries = new BoundaryRows(db, this.transcripts);
    }

    readRecap(tab: string): TabRecap | null {
        return guarded(() => this.reader.read(tab), null);
    }

    lastRunOf(tab: string): LastRun | null {
        return guarded(() => {
            const row = this.orm.select({ at: runs.at, cause: runs.cause }).from(runs).innerJoin(lastGoodRun, eq(lastGoodRun.runId, runs.id))
                .where(eq(lastGoodRun.tabId, tabId(tab))).get() ?? null;
            const cause = row === null ? null : causeOf(row.cause);
            return row === null || cause === null ? null : { at: row.at, cause };
        }, null);
    }

    beginRun(tab: string, backend: string | null, at: number): void {
        writeTx(this.db, () => {
            this.tabs.ensure(tab, at);
            this.orm.update(tabs).set({ running: 1, backend }).where(eq(tabs.id, tabId(tab))).run();
        });
    }

    recordRun(run: RecordedRun): void {
        writeTx(this.db, () => {
            this.tabs.ensure(run.tab, run.at);
            const moved = this.transcripts.attach(run.tab, run.lanes, run.at);
            this.boundaries.record(run.tab, { at: run.at, marks: run.marks ?? [], moved });
            const id = this.runs.insertRun(run, null, run.gateStats ?? null);
            if (run.input !== undefined) {
                this.runs.insertInput(id, run.input);
            }
            this.runs.insertReads(id, moved);
            this.runs.writeTasks(id, run, run.tasks);
            for (const { task, ops } of run.ops) {
                this.ledger.applyTo(id, { id: typeIdOf('run', id) as RunId, task: { tab: run.tab, key: task }, at: run.at, language: run.language, mint: () => typeIdOf('fact', ids.next()) as FactId }, ops, true);
            }
            this.settle(run);
        });
    }

    failRun(run: FailedRun): void {
        writeTx(this.db, () => {
            this.tabs.ensure(run.tab, run.at);
            const moved = this.transcripts.attach(run.tab, run.lanes, run.at);
            this.boundaries.record(run.tab, { at: run.at, marks: run.marks ?? [], moved });
            this.runs.insertRun(run, run.error);
            this.settle(run);
        });
    }

    advance(move: Advance): void {
        writeTx(this.db, () => {
            this.tabs.ensure(move.tab, move.at);
            const moved = this.transcripts.attach(move.tab, move.lanes, move.at);
            this.boundaries.record(move.tab, { at: move.at, marks: move.marks ?? [], moved });
            this.orm.update(tabs).set({ error: move.error }).where(eq(tabs.id, tabId(move.tab))).run();
        });
    }

    private settle(run: Pick<RecordedRun, 'tab' | 'backend' | 'error'>): void {
        this.orm.update(tabs).set({ running: 0, backend: run.backend, error: run.error }).where(eq(tabs.id, tabId(run.tab))).run();
    }
}
