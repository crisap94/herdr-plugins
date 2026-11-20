import type { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import type { Advance, FailedRun, LastRun, RecordedRun, TabRecap } from '#src/ports/recap-records.ts';
import type { GuardedRecapRecords } from '#src/ports/guarded-reads.ts';
import { RECAP_CAUSES } from '#src/recap/domain/intent.ts';
import type { RecapCause } from '#src/recap/domain/intent.ts';
import { parseTabId, tabId } from '#src/recap/domain/ids.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { Unknown } from '#src/ports/unknowable.ts';
import { lastGoodRun, run as runs, tab as tabs } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { BoundaryRows } from './boundaries.ts';
import { writeTx } from './connection.ts';
import { LedgerRows } from './ledger-rows.ts';
import { RecapReader } from './recap-read.ts';
import { guardedRead } from './rows.ts';
import { RunRows } from './run-write/legacy.ts';
import { TabStore } from './tab-row.ts';
import { TranscriptRows } from './transcripts/legacy.ts';

type LastCause = RecapCause | 'imported';

const isLastCause = (raw: unknown): raw is LastCause => raw === 'imported' || RECAP_CAUSES.some((cause) => cause === raw);

export class RecapRecordsRepository implements GuardedRecapRecords {
    private readonly db: Database;
    private readonly reader: RecapReader;
    private readonly tabs: TabStore;
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
        this.tabs = new TabStore(db);
        this.transcripts = new TranscriptRows(db);
        this.runs = new RunRows(db, this.transcripts);
        this.boundaries = new BoundaryRows(db, this.transcripts);
    }

    readRecap(tab: string): TabRecap | null | Unknown {
        const parsed = parseTabId(tab);
        return parsed.kind === 'err' ? null : guardedRead(() => this.reader.read(parsed.value));
    }

    lastRunOf(tab: string): LastRun | null | Unknown {
        return guardedRead((): LastRun | null => {
            const row = this.orm.select({ at: runs.at, cause: runs.cause }).from(runs).innerJoin(lastGoodRun, eq(lastGoodRun.runId, runs.id))
                .where(eq(lastGoodRun.tabId, tabId(tab))).get() ?? null;
            return row === null || !isLastCause(row.cause) ? null : { at: row.at, cause: row.cause };
        });
    }

    beginRun(tab: string, backend: string | null, at: number): void {
        writeTx(this.db, () => {
            this.tabs.ensure(tabId(tab), instant(at));
            this.orm.update(tabs).set({ running: 1, backend }).where(eq(tabs.id, tabId(tab))).run();
        });
    }

    recordRun(run: RecordedRun): void {
        writeTx(this.db, () => {
            this.tabs.ensure(tabId(run.tab), instant(run.at));
            const moved = this.transcripts.attach(run.tab, run.lanes, run.at);
            this.boundaries.record(tabId(run.tab), { at: instant(run.at), marks: run.marks ?? [], moved });
            const id = this.runs.insertRun(run, null, run.gateStats ?? null);
            if (run.input !== undefined) {
                this.runs.insertInput(id, run.input);
            }
            this.runs.insertReads(id, moved);
            this.runs.writeTasks(id, run, run.tasks);
            this.ledger.keep(id, run.changed);
            this.settle(run);
        });
    }

    failRun(run: FailedRun): void {
        writeTx(this.db, () => {
            this.tabs.ensure(tabId(run.tab), instant(run.at));
            const moved = this.transcripts.attach(run.tab, run.lanes, run.at);
            this.boundaries.record(tabId(run.tab), { at: instant(run.at), marks: run.marks ?? [], moved });
            this.runs.insertRun(run, run.error);
            this.settle(run);
        });
    }

    advance(move: Advance): void {
        writeTx(this.db, () => {
            this.tabs.ensure(tabId(move.tab), instant(move.at));
            const moved = this.transcripts.attach(move.tab, move.lanes, move.at);
            this.boundaries.record(tabId(move.tab), { at: instant(move.at), marks: move.marks ?? [], moved });
            this.orm.update(tabs).set({ error: move.error }).where(eq(tabs.id, tabId(move.tab))).run();
        });
    }

    private settle(run: Pick<RecordedRun, 'tab' | 'backend' | 'error'>): void {
        this.orm.update(tabs).set({ running: 0, backend: run.backend, error: run.error }).where(eq(tabs.id, tabId(run.tab))).run();
    }
}
