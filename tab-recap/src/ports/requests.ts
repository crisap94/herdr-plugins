import type { TabId } from '#src/recap/domain/ids.ts';

/** Something the operator asked for: one tab's column, or every column, hidden, shown or `toggle`d (the daemon flips what it holds at that moment). */
export interface VisibilityRequest {
    /** the word `all`, or a tab id */
    readonly target: string;
    readonly hidden: boolean | 'toggle';
}

/** What the columns and commands ask of the daemon: a queue the daemon empties. */
export interface Requests {
    request(tab: string): void;
    requestVisibility(request: VisibilityRequest): void;
    takeRequests(): readonly TabId[];
    takeVisibility(): readonly VisibilityRequest[];
}
