import { join } from 'node:path';
import type { Database } from 'bun:sqlite';
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
import type { Retention, TabRetirement } from '#src/ports/retention.ts';
import type { ClosureReader, ClosureRecorder, ClosureRuns, ClosureSweep } from '#src/ports/closed-lanes.ts';
import type { LiveLanes, TabViews } from '#src/ports/tab-views.ts';
import { ClosedLanesRepository } from './closed-lanes.ts';
import { closeDatabase } from './connection.ts';
import { must } from '#src/protocol/result.ts';
import { parseFsPath, type FsPath } from '#src/recap/domain/fs-path.ts';
import type { Directory } from '#src/recap/domain/directory.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { DEFAULT_CLOSED_LANE_DAYS } from '#src/recap/domain/retention.ts';
import type { ClosedLaneDays } from '#src/recap/domain/retention.ts';
import { AskLedgerRepository, AutocompactBriefsRepository, AutocompactRecordsRepository, BoundaryRepository, CompactionRecordsRepository, HandoffAnswersRepository } from './legacy.ts';
import type { AutocompactBriefs } from '#src/ports/autocompact-briefs.ts';
import { ColumnVisibilityRepository } from './column-visibility.ts';
import { LedgerRepository } from './ledger.ts';
import { openDatabase } from './open.ts';
import type { NewerDatabase, Role, StaleDatabase } from './open.ts';
import { MIGRATIONS } from './schema/index.ts';
import { RecapRecordsRepository } from './recap-records.ts';
import { RequestsRepository } from './requests.ts';
import type { AskLedger } from '#src/ports/ask-ledger.ts';
import { RunInputsRepository } from './run-inputs.ts';
import { VerdictsRepository } from './verdicts.ts';
import { SessionSourceRepository } from './session-source.ts';
import { StoriesRepository } from './stories.ts';
import { RetentionRepository } from './retention.ts';
import { TabViewsRepository } from './tab-views.ts';
import type { HandoffAnswers } from '#src/ports/handoff-answers.ts';
import type { PaneNoteReader, PaneNoteWriter, WorktreeStatusReader, WorktreeStatusWriter } from '#src/ports/worktree-status.ts';
import type { PaneAlertReader, PaneAlertWriter } from '#src/ports/pane-alerts.ts';
import { PaneAlertsRepository } from './pane-alerts.ts';
import { PaneNotesRepository } from './pane-notes.ts';
import { WorktreeStatusRepository } from './worktree-status.ts';

export interface Store {
    readonly kind: 'ready';
    readonly db: Database;
    readonly records: RecapRecords;
    readonly ledger: Ledger;
    readonly views: TabViews & LiveLanes;
    readonly visibility: ColumnVisibility;
    readonly requests: Requests & CompactionQueue;
    readonly handoffs: HandoffAnswers;
    readonly compactions: CompactionRecords;
    readonly asks: AskLedger;
    readonly autocompact: AutocompactRecords;
    readonly autocompactBriefs: AutocompactBriefs;
    readonly inputs: RunInputs;
    readonly verdicts: Verdicts;
    readonly stories: Stories;
    readonly session: SessionSource;
    readonly boundaries: Boundaries;
    readonly retention: Retention & TabRetirement;
    readonly closedLanes: ClosureRecorder & ClosureReader & ClosureRuns & ClosureSweep;
    readonly closedDays: ClosedLaneDays;
    readonly worktrees: WorktreeStatusWriter & WorktreeStatusReader;
    readonly paneNotes: PaneNoteWriter & PaneNoteReader;
    readonly paneAlerts: PaneAlertWriter & PaneAlertReader;
    checkpoint(): void;
    close(): void;
}

export interface StoreSettings {
    readonly daemonVersion?: Text | null;
    readonly now?: () => Instant;
    readonly log?: (line: Text) => void;
    readonly closedDays?: ClosedLaneDays;
}

export type { StoreOptions } from './legacy.ts';
export { databasePath, openStore, stateStore } from './legacy.ts';

export function storeOver(db: Database, options: StoreSettings = {}): Store {
    const ledger = new LedgerRepository(db);
    return {
        kind: 'ready', db, records: new RecapRecordsRepository(db), ledger, views: new TabViewsRepository(db, options.daemonVersion ?? null),
        visibility: new ColumnVisibilityRepository(db), requests: new RequestsRepository(db, options.now), handoffs: new HandoffAnswersRepository(db, options.now), compactions: new CompactionRecordsRepository(db), asks: new AskLedgerRepository(db, options.log), autocompact: new AutocompactRecordsRepository(db), autocompactBriefs: new AutocompactBriefsRepository(db),
        inputs: new RunInputsRepository(db), verdicts: new VerdictsRepository(db),
        stories: new StoriesRepository(db, ledger), session: new SessionSourceRepository(db),
        boundaries: new BoundaryRepository(db), retention: new RetentionRepository(db),
        closedLanes: new ClosedLanesRepository(db, options.closedDays ?? DEFAULT_CLOSED_LANE_DAYS),
        closedDays: options.closedDays ?? DEFAULT_CLOSED_LANE_DAYS,
        worktrees: new WorktreeStatusRepository(db), paneNotes: new PaneNotesRepository(db), paneAlerts: new PaneAlertsRepository(db),
        checkpoint: (): void => { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); },
        close: (): void => { closeDatabase(db); },
    };
}

export const databaseFile = (stateDir: Directory): FsPath => must(parseFsPath(join(stateDir, 'tab-recap.db')));

export function openStoreAt(path: FsPath, options: StoreSettings = {}, role: Role = 'owner'): Store | NewerDatabase | StaleDatabase {
    const opened = openDatabase(path, MIGRATIONS, role);
    return opened.kind === 'ready' ? storeOver(opened.db, options) : opened;
}
