import type { TabId } from '#src/recap/domain/ids.ts';

/** Something the operator asked for: one tab's column, or every column, hidden, shown or `toggle`d (the daemon flips what it holds at that moment). */
export interface VisibilityRequest {
    /** the word `all`, or a tab id */
    readonly target: string;
    readonly hidden: boolean | 'toggle';
}

/** The operator asked to compact an agent: the tab, the agent's pane (null: the tab's focused one) and an optional focus note. */
export interface CompactRequest {
    readonly tab: string;
    readonly pane: string | null;
    readonly note: string | null;
}

/** What the columns and commands ask of the daemon: a queue the daemon empties. */
export interface Requests {
    request(tab: string): void;
    requestVisibility(request: VisibilityRequest): void;
    requestCompact(request: CompactRequest): void;
    takeRequests(): readonly TabId[];
    takeVisibility(): readonly VisibilityRequest[];
    takeCompactions(): readonly CompactRequest[];
}
