import type { TabRecap } from '#src/ports/recap-records.ts';
import type { TabView } from '#src/ports/tab-views.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { Store } from '../database.ts';
import { holdingOf, recapDifferenceLines, viewDifferenceLines } from './equivalence.ts';
import { compareLegacyFiles, importFilesAt, type ImportOutcome, type ImportReport } from './import-files.ts';
import type { LegacyFiles } from './legacy-files.ts';

export const holdsAnything = (file: TabRecap): boolean => holdingOf(file) === 'present';

export const recapDifferences = (was: TabRecap, now: TabRecap | null): readonly string[] => recapDifferenceLines(was, now);

export const viewDifferences = (was: TabView, now: TabView | null): readonly string[] => viewDifferenceLines(was, now);

export const loadAndCompare = (store: Store, legacy: LegacyFiles, now: number): ImportReport => compareLegacyFiles(store, legacy, instant(now));

export interface LegacyImportOptions {
    readonly now: () => number;
    readonly afterInsert?: () => void;
}

export function importFiles(store: Store, legacy: LegacyFiles, options: LegacyImportOptions): ImportOutcome {
    return importFilesAt(store, legacy, { ...options, now: () => instant(options.now()) });
}
