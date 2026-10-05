import type { HiddenState } from '#src/recap/domain/board.ts';
import type { RecapSections } from '#src/recap/domain/shape.ts';
import type { TabId } from '#src/recap/domain/ids.ts';

/** What a column renders about one lane of its tab. */
export interface TabLane {
    readonly pane: string;
    readonly agent: string;
    readonly status: string;
    readonly title: string | null;
}

export interface TabView {
    readonly tab: string;
    readonly column: string | null;
    readonly lanes: readonly TabLane[];
    readonly at: number;
}

/** How far one lane's transcript has been read into the tab's recap, and what it says about itself. */
export interface LaneCursor {
    readonly pane: string;
    readonly agent: string;
    readonly transcript: string;
    readonly cursor: number;
    readonly title: string | null;
    readonly lastPrompt: string | null;
    readonly claudeRecap: string | null;
}

/** THE recap of one tab: every lane in it, one Markdown document. */
export interface TabRecap {
    readonly tab: string;
    readonly lanes: readonly LaneCursor[];
    /** the recap as the writer's data; null for a recap stored before the fixed structure, which shows its `markdown` as it is */
    readonly sections: RecapSections | null;
    /** the sections drawn in the recap language (or, for an old recap, what it always was) */
    readonly markdown: string;
    readonly at: number | null;
    readonly running: boolean;
    readonly backend: string | null;
    readonly error: string | null;
    readonly costUsd: number;
    /** what `markdown` is written in (`en`, `es` or free text); a recap stored before this existed is `en` */
    readonly language: string;
}

export function blankRecap(tab: string): TabRecap {
    return { tab, lanes: [], sections: null, markdown: '', at: null, running: false, backend: null, error: null, costUsd: 0, language: 'en' };
}

/** Something the operator asked for with `hide`/`show`: one tab's column, or every column. */
export interface VisibilityRequest {
    /** the word `all`, or a tab id */
    readonly target: string;
    readonly hidden: boolean;
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
