import { join } from 'node:path';
import type { Database } from 'bun:sqlite';
import type { AutocompactRecords } from '#src/ports/autocompact-records.ts';
import type { DecisionLedger } from '#src/ports/autocompact-records.ts';
import type { CompactionRecords } from '#src/ports/compaction-records.ts';
import type { Boundaries } from '#src/ports/boundaries.ts';
import type { ColumnVisibility } from '#src/ports/column-visibility.ts';
import type { GuardedLedger, GuardedRecapRecords } from '#src/ports/guarded-reads.ts';
import type { CompactionQueue, Requests } from '#src/ports/requests.ts';
import type { RunInputReader } from '#src/ports/run-inputs.ts';
import type { VerdictStore } from '#src/ports/verdicts.ts';
import type { SessionSource } from '#src/ports/session-source.ts';
import type { Stories } from '#src/ports/stories.ts';
import type { RetentionPort, TabRetirement } from '#src/ports/retention.ts';
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
import { AskLedgerRepository, AutocompactBriefsRepository, AutocompactRecordsRepository, BoundaryRepository, CompactionRecordsRepository } from './legacy.ts';
import type { AutocompactBriefs } from '#src/ports/autocompact-briefs.ts';
import { ColumnVisibilityRepository } from './column-visibility.ts';
import { LedgerRepository } from './ledger.ts';
import { DecisionLedgerRepository } from './autocompact-records.ts';
import { openForRole } from './open.ts';
import type { NewerDatabase, Role, StaleDatabase } from './open.ts';
import { MIGRATIONS } from './schema/index.ts';
import { RecapRecordsRepository } from './recap-records.ts';
import { RequestsRepository } from './requests.ts';
import type { AskLedger } from '#src/ports/ask-ledger.ts';
import { RunInputStore } from './run-inputs.ts';
import { VerdictRowStore } from './verdicts.ts';
import { SessionSourceRepository } from './session-source/legacy.ts';
import { StoriesRepository } from './stories.ts';
import { RetentionRepository } from './retention.ts';
import { TabViewsRepository } from './tab-views/legacy.ts';
import type { HandoffAnswerStore } from '#src/ports/handoff-answers.ts';
import { HandoffAnswerRepository } from './handoff-answers.ts';
import type { PaneNoteReader, PaneNoteWriter, WorktreeStatusReader, WorktreeStatusWriter } from '#src/ports/worktree-status.ts';
import type { PaneAlertReader, PaneAlertWriter } from '#src/ports/pane-alerts.ts';
import { PaneAlertsRepository } from './pane-alerts.ts';
import { PaneNotesRepository } from './pane-notes.ts';
import { WorktreeStatusRepository } from './worktree-status.ts';

export interface Store {
    readonly kind: 'ready';
    readonly db: Database;
    readonly records: GuardedRecapRecords;
    readonly ledger: GuardedLedger;
    readonly views: TabViews & LiveLanes;
    readonly visibility: ColumnVisibility;
    readonly requests: Requests & CompactionQueue;
    readonly handoffs: HandoffAnswerStore;
    readonly compactions: CompactionRecords;
    readonly asks: AskLedger;
    readonly autocompact: AutocompactRecords;
    readonly decisions: DecisionLedger;
    readonly autocompactBriefs: AutocompactBriefs;
    readonly inputs: RunInputReader;
    readonly verdicts: VerdictStore;
    readonly stories: Stories;
    readonly session: SessionSource;
    readonly boundaries: Boundaries;
    readonly retention: RetentionPort & TabRetirement;
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

export function storeOver(db: Database, options: StoreSettings = {}): Store {
    const ledger = new LedgerRepository(db);
    return {
        kind: 'ready', db, records: new RecapRecordsRepository(db), ledger, views: new TabViewsRepository(db, options.daemonVersion ?? null),
        visibility: new ColumnVisibilityRepository(db), requests: new RequestsRepository(db, options.now), handoffs: new HandoffAnswerRepository(db, options.now), compactions: new CompactionRecordsRepository(db), asks: new AskLedgerRepository(db, options.log), autocompact: new AutocompactRecordsRepository(db), decisions: new DecisionLedgerRepository(db), autocompactBriefs: new AutocompactBriefsRepository(db),
        inputs: new RunInputStore(db), verdicts: new VerdictRowStore(db),
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

export function openStoreAt(path: FsPath, options?: StoreSettings, role?: 'owner'): Store | NewerDatabase;
export function openStoreAt(path: FsPath, options: StoreSettings, role: Role): Store | NewerDatabase | StaleDatabase;
export function openStoreAt(path: FsPath, options: StoreSettings = {}, role: Role = 'owner'): Store | NewerDatabase | StaleDatabase {
    const opened = openForRole(path, MIGRATIONS, role);
    return opened.kind === 'ready' ? storeOver(opened.db, options) : opened;
}
