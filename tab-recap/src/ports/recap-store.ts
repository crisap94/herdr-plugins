import type { HiddenState } from '#src/recap/domain/board.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';
import type { TabId } from '#src/recap/domain/ids.ts';

/** What a column renders about one lane of its tab. */
export interface TabLane {
    readonly pane: string;
    readonly agent: string;
    readonly status: string;
    readonly title: string | null;
    /** where the lane works; null when herdr did not say, or for a view stored before this existed */
    readonly cwd: string | null;
    /** the newest thing the operator typed to this lane (the live prompt); absent or null when unknown, or for a view stored before this existed */
    readonly lastPrompt?: string | null;
}

export interface TabView {
    readonly tab: string;
    readonly column: string | null;
    readonly lanes: readonly TabLane[];
    readonly at: number;
    /** the plugin version the daemon that wrote this view was started with; null for a view stored before this existed */
    readonly daemonVersion?: string | null;
}

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

/** Something the operator asked for: one tab's column, or every column, hidden, shown or `toggle`d (the daemon flips what it holds at that moment). */
export interface VisibilityRequest {
    /** the word `all`, or a tab id */
    readonly target: string;
    readonly hidden: boolean | 'toggle';
}

export const NOTHING_HIDDEN: HiddenState = { all: false, hidden: [], shown: [] };

export interface RecapStore {
    readRecap(tab: string): TabRecap | null;
    writeRecap(recap: TabRecap): void;
    readTab(tab: string): TabView | null;
    writeTab(view: TabView): void;
    request(tab: string): void;
    takeRequests(): readonly TabId[];
    /** the hidden columns as last saved by the daemon */
    readHidden(): HiddenState;
    writeHidden(state: HiddenState): void;
    requestVisibility(request: VisibilityRequest): void;
    takeVisibility(): readonly VisibilityRequest[];
}
