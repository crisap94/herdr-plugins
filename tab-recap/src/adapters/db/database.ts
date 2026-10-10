// The composition: one connection, the repositories. Each consumer takes the port it uses.
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { AutocompactRecords } from '#src/ports/autocompact-records.ts';
import type { CompactionRecords } from '#src/ports/compaction-records.ts';
import type { Boundaries } from '#src/ports/boundaries.ts';
import type { ColumnVisibility } from '#src/ports/column-visibility.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import type { RecapRecords } from '#src/ports/recap-records.ts';
import type { CompactionQueue, Requests } from '#src/ports/requests.ts';
import type { RunInputs } from '#src/ports/run-inputs.ts';
import type { Verdicts } from '#src/ports/verdicts.ts';
import type { SessionSource } from '#src/ports/session-source.ts';
import type { Stories } from '#src/ports/stories.ts';
import type { Retention } from '#src/ports/retention.ts';
import type { TabViews } from '#src/ports/tab-views.ts';
import { AutocompactRecordsRepository } from './autocompact-records.ts';
import { CompactionRecordsRepository } from './compaction-records.ts';
import { BoundaryRepository } from './boundary-read.ts';
import { ColumnVisibilityRepository } from './column-visibility.ts';
import { LedgerRepository } from './ledger.ts';
import { openDatabase } from './open.ts';
import type { NewerDatabase } from './open.ts';
import { RecapRecordsRepository } from './recap-records.ts';
import { RequestsRepository } from './requests.ts';
import { AskRepository } from './ask-records.ts';
import type { AskRecords } from '#src/ports/ask-records.ts';
import { RunInputsRepository } from './run-inputs.ts';
import { VerdictsRepository } from './verdicts.ts';
import { SessionSourceRepository } from './session-source.ts';
import { StoriesRepository } from './stories.ts';
import { RetentionRepository } from './retention.ts';
import { TabViewsRepository } from './tab-views.ts';

export interface Store {
    readonly kind: 'ready';
    readonly db: DatabaseSync;
    readonly records: RecapRecords;
    readonly ledger: Ledger;
    readonly views: TabViews;
    readonly visibility: ColumnVisibility;
    readonly requests: Requests & CompactionQueue;
    readonly compactions: CompactionRecords;
    /** the compaction requests other tools made, accepted once per (tool, id) */
    readonly asks: AskRecords;
    /** what autocompact decided, lane by lane */
    readonly autocompact: AutocompactRecords;
    readonly inputs: RunInputs;
    readonly verdicts: Verdicts;
    /** the curator's paragraph per task; its merges go through `ledger` */
    readonly stories: Stories;
    /** what the expanded view counts: when the tab began, its runs, its compactions */
    readonly session: SessionSource;
    readonly boundaries: Boundaries;
    readonly retention: Retention;
    /** the daemon's upkeep: fold the write-ahead log back into the file and truncate it */
    checkpoint(): void;
    /** the daemon, on shutdown */
    close(): void;
}

export interface StoreOptions {
    /** only the daemon gives it: every view it writes says which version it runs */
    readonly daemonVersion?: string | null;
    readonly now?: () => number;
}

export function storeOver(db: DatabaseSync, options: StoreOptions = {}): Store {
    const ledger = new LedgerRepository(db);
    return {
        kind: 'ready', db, records: new RecapRecordsRepository(db), ledger, views: new TabViewsRepository(db, options.daemonVersion ?? null),
        visibility: new ColumnVisibilityRepository(db), requests: new RequestsRepository(db, options.now), compactions: new CompactionRecordsRepository(db), asks: new AskRepository(db, options.now), autocompact: new AutocompactRecordsRepository(db),
        inputs: new RunInputsRepository(db), verdicts: new VerdictsRepository(db),
        stories: new StoriesRepository(db, ledger), session: new SessionSourceRepository(db),
        boundaries: new BoundaryRepository(db), retention: new RetentionRepository(db),
        checkpoint: (): void => { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); },
        close: (): void => { db.close(); },
    };
}

/** The store at `path`, or `newer-db` when a newer plugin wrote it (then it is read-only and nothing here writes). */
export const databasePath = (stateDir: string): string => join(stateDir, 'tab-recap.db');

export function openStore(path: string, options: StoreOptions = {}): Store | NewerDatabase {
    const opened = openDatabase(path);
    return opened.kind === 'ready' ? storeOver(opened.db, options) : opened;
}

/** The store in the plugin's state directory — what every process (CLI, setup, column, daemon) opens. */
export const stateStore = (stateDir: string, options: StoreOptions = {}): Store | NewerDatabase => openStore(databasePath(stateDir), options);
