import type { TabId } from '#src/recap/domain/ids.ts';
import type { Origin } from '#src/recap/domain/origin.ts';

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
    /** who asked: the operator (the default), autocompact, or another tool (`request`) */
    readonly origin?: Origin;
    /** a request from another tool: its id, which tab-recap answers on the pane (`tab-recap-compact`) */
    readonly answer?: string;
}

/** What the columns and commands ask of the daemon: a queue the daemon empties. */
export interface Requests {
    request(tab: string): void;
    requestVisibility(request: VisibilityRequest): void;
    requestCompact(request: CompactRequest): void;
    /** The expanded view opened over a tab whose ledger changed since its story was written: the daemon curates the tab's tasks. */
    requestCurate(tab: string): void;
    takeRequests(): readonly TabId[];
    takeVisibility(): readonly VisibilityRequest[];
    takeCompactions(): readonly CompactRequest[];
    takeCurations(): readonly TabId[];
    /** the compaction requests from other tools still queued (not yet taken): removed, each with its pane and answer id */
    takeAnswered(): readonly { readonly pane: string; readonly answer: string }[];
}

/** Whether a compaction request for a lane is still queued (not yet taken). A request with no pane is the tab's focused one, so it counts for every pane of the tab. */
export interface CompactionQueue {
    compactQueued(tab: string, pane: string): boolean;
}
