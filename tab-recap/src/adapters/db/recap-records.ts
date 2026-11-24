import { must } from '#src/protocol/result.ts';
import type { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import type { Advance, FailedRun, LastRun, RecordedRun, Recap } from '#src/ports/recap-records.ts';
import type { GuardedRecapRecords } from '#src/ports/guarded-reads.ts';
import { RECAP_CAUSES } from '#src/recap/domain/intent.ts';
import type { RecapCause } from '#src/recap/domain/intent.ts';
import { parseTabId } from '#src/recap/domain/ids.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { Unknown } from '#src/ports/unknowable.ts';
import { lastGoodRun, run as runs, tab as tabs } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { BoundaryRows } from './boundaries.ts';
import { writeTx } from './connection.ts';
import { LedgerRows } from './ledger-rows.ts';
import { RecapReader } from './recap-read.ts';
import { guardedRead } from './rows.ts';
import { RunRows } from './run-write.ts';
import { TabStore } from './tab-row.ts';
import { TranscriptStore } from './transcripts.ts';

type LastCause = RecapCause | 'imported';

const isLastCause = (raw: unknown): raw is LastCause => raw === 'imported' || RECAP_CAUSES.some((cause) => cause === raw);

export class RecapRecordsRepository implements GuardedRecapRecords {
    private readonly db: Database;
    private readonly reader: RecapReader;
    private readonly tabs: TabStore;
    private readonly transcripts: TranscriptStore;
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
        this.transcripts = new TranscriptStore(db);
        this.runs = new RunRows(db, this.transcripts);
        this.boundaries = new BoundaryRows(db, this.transcripts);
    }

    readRecap(tab: string): Recap | null | Unknown {
        const parsed = parseTabId(tab);
        return parsed.kind === 'err' ? null : guardedRead(() => this.reader.read(parsed.value));
    }

    lastRunOf(tab: string): LastRun | null | Unknown {
        return guardedRead((): LastRun | null => {
            const row = this.orm.select({ at: runs.at, cause: runs.cause }).from(runs).innerJoin(lastGoodRun, eq(lastGoodRun.runId, runs.id))
                .where(eq(lastGoodRun.tabId, must(parseTabId(tab)))).get() ?? null;
            return row === null || !isLastCause(row.cause) ? null : { at: instant(row.at), cause: row.cause };
        });
    }

    beginRun(tab: string, backend: string | null, at: number): void {
        writeTx(this.db, () => {
            this.tabs.ensure(must(parseTabId(tab)), instant(at));
            this.orm.update(tabs).set({ running: 1, backend }).where(eq(tabs.id, must(parseTabId(tab)))).run();
        });
    }

    recordRun(run: RecordedRun): void {
        writeTx(this.db, () => {
            this.tabs.ensure(run.scope, instant(run.at));
            const moved = this.transcripts.attach(run.scope, run.sessions, instant(run.at));
            this.boundaries.record(run.scope, { at: instant(run.at), marks: run.marks ?? [], moved });
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
            this.tabs.ensure(run.scope, instant(run.at));
            const moved = this.transcripts.attach(run.scope, run.sessions, instant(run.at));
            this.boundaries.record(run.scope, { at: instant(run.at), marks: run.marks ?? [], moved });
            this.runs.insertRun(run, run.error);
            this.settle(run);
        });
    }

    advance(move: Advance): void {
        writeTx(this.db, () => {
            this.tabs.ensure(move.scope, instant(move.at));
            const moved = this.transcripts.attach(move.scope, move.sessions, instant(move.at));
            this.boundaries.record(move.scope, { at: instant(move.at), marks: move.marks ?? [], moved });
            this.orm.update(tabs).set({ error: move.error }).where(eq(tabs.id, move.scope)).run();
        });
    }

    private settle(run: Pick<RecordedRun, 'scope' | 'backend' | 'error'>): void {
        this.orm.update(tabs).set({ running: 0, backend: run.backend, error: run.error }).where(eq(tabs.id, run.scope)).run();
    }
}
