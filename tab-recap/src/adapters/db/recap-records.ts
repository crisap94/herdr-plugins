// The RecapRecords repository: a run's writes land in one transaction — the run, what it read, its tasks, the cursors it advanced.
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { Advance, FailedRun, RecapRecords, RecordedRun, TabRecap } from '#src/ports/recap-records.ts';
import type { FactId, RunId } from '#src/recap/domain/fact.ts';
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

export class RecapRecordsRepository implements RecapRecords {
    private readonly db: DatabaseSync;
    private readonly reader: RecapReader;
    private readonly tabs: TabRow;
    private readonly transcripts: TranscriptRows;
    private readonly runs: RunRows;
    private readonly ledger: LedgerRows;
    private readonly boundaries: BoundaryRows;
    private readonly begin: StatementSync;
    private readonly settleStatement: StatementSync;
    private readonly errorOnly: StatementSync;

    constructor(db: DatabaseSync) {
        this.db = db;
        this.ledger = new LedgerRows(db);
        this.reader = new RecapReader(db, this.ledger);
        this.tabs = new TabRow(db);
        this.transcripts = new TranscriptRows(db);
        this.runs = new RunRows(db, this.transcripts);
        this.boundaries = new BoundaryRows(db, this.transcripts);
        this.begin = db.prepare('UPDATE tab SET running = 1, backend = ? WHERE id = ?');
        this.settleStatement = db.prepare('UPDATE tab SET running = 0, backend = ?, error = ? WHERE id = ?');
        this.errorOnly = db.prepare('UPDATE tab SET error = ? WHERE id = ?');
    }

    readRecap(tab: string): TabRecap | null {
        return guarded(() => this.reader.read(tab), null);
    }

    beginRun(tab: string, backend: string | null, at: number): void {
        writeTx(this.db, () => {
            this.tabs.ensure(tab, at);
            this.begin.run(backend, tab);
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
                this.ledger.applyTo(id, { id: typeIdOf('run', id) as RunId, task: { tab: run.tab, key: task }, at: run.at, language: run.language, mint: () => typeIdOf('fact', ids.next()) as FactId }, ops);
            }
            this.settleStatement.run(run.backend, run.error, run.tab);
        });
    }

    /** The cursors stay where the caller says (the old ones); only what the lanes say about themselves moves. */
    failRun(run: FailedRun): void {
        writeTx(this.db, () => {
            this.tabs.ensure(run.tab, run.at);
            const moved = this.transcripts.attach(run.tab, run.lanes, run.at);
            this.boundaries.record(run.tab, { at: run.at, marks: run.marks ?? [], moved });
            this.runs.insertRun(run, run.error);
            this.settleStatement.run(run.backend, run.error, run.tab);
        });
    }

    advance(move: Advance): void {
        writeTx(this.db, () => {
            this.tabs.ensure(move.tab, move.at);
            const moved = this.transcripts.attach(move.tab, move.lanes, move.at);
            this.boundaries.record(move.tab, { at: move.at, marks: move.marks ?? [], moved });
            this.errorOnly.run(move.error, move.tab);
        });
    }
}
