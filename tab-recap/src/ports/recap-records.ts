import type { RecapCause } from '#src/recap/domain/intent.ts';
import type { GateStats } from '#src/recap/domain/gates/index.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';

/** How far one lane's source has been read into the tab's recap, and what it says about itself. */
export interface LaneCursor {
    readonly pane: string;
    readonly agent: string;
    readonly transcript: string;
    /** where the lane's reader left off; what the number means is the reader's business (bytes, a time, a revision) */
    readonly cursor: number;
    /** a hash of the last screen read; null for every other source */
    readonly tail: string | null;
    readonly title: string | null;
    readonly lastPrompt: string | null;
    readonly claudeRecap: string | null;
}

/**
 * The recaps of one tab: every lane in it, grouped into tasks, one recap per task. A tab with one piece of work
 * (the usual case) has one task; a recap stored before tasks existed reads back as one.
 */
export interface TabRecap {
    readonly tab: string;
    readonly lanes: readonly LaneCursor[];
    readonly tasks: readonly RecapTask[];
    readonly at: number | null;
    readonly running: boolean;
    readonly backend: string | null;
    readonly error: string | null;
    readonly costUsd: number;
    /** what `markdown` is written in (`en`, `es` or free text); a recap stored before this existed is `en` */
    readonly language: string;
}

export function blankRecap(tab: string): TabRecap {
    return { tab, lanes: [], tasks: [], at: null, running: false, backend: null, error: null, costUsd: 0, language: 'en' };
}

/** Whether any recap has been written yet. */
export const hasRecap = (recap: TabRecap): boolean => recap.tasks.some((task) => task.markdown !== '');

/** One writer call: what it was for, who wrote it, and what it cost. */
export interface RunFacts {
    readonly tab: string;
    readonly at: number;
    readonly cause: RecapCause | 'imported';
    readonly backend: string | null;
    readonly language: string;
    readonly costUsd: number;
}

/** A run that wrote a recap: the tasks it settled on and every lane's cursor, advanced. `error` is the lane read errors, when some lane could not be read. */
export interface RecordedRun extends RunFacts {
    readonly error: string | null;
    readonly lanes: readonly LaneCursor[];
    readonly tasks: readonly RecapTask[];
    /** the document the writer was given, kept (compressed) for judging; absent: not kept */
    readonly input?: string;
    /** what the gates refused, flagged and dropped; absent for a run that was not gated (an import) */
    readonly gateStats?: GateStats;
}

/** A run that did not: the cursors stay where they were (only what the lanes say about themselves moves). */
export interface FailedRun extends RunFacts {
    readonly error: string;
    readonly lanes: readonly LaneCursor[];
}

/** Nothing new to write: the lanes' cursors and notes move, no run is made. */
export interface Advance {
    readonly tab: string;
    readonly at: number;
    readonly error: string | null;
    readonly lanes: readonly LaneCursor[];
}

/** One distinct line of the recap across a session: the section it stood in, when it first and last appeared (epoch ms) and in how many runs. */
export interface HistoryItem {
    readonly section: string;
    readonly text: string;
    readonly firstAt: number;
    readonly lastAt: number;
    readonly seen: number;
}

/** The history of a tab's recaps (chapter → run → task → item). A run's writes land together or not at all. */
export interface RecapRecords {
    /** The current recap: the last run that wrote one, plus the tab's lanes, running flag and error line. */
    readRecap(tab: string): TabRecap | null;
    /** Every distinct recap line of the tasks that hold `pane`, across all runs and chapters: newest first, at most 300 (finished items and references are cut first). */
    readHistory(tab: string, pane: string): readonly HistoryItem[];
    beginRun(tab: string, backend: string | null, at: number): void;
    recordRun(run: RecordedRun): void;
    failRun(run: FailedRun): void;
    advance(move: Advance): void;
}
