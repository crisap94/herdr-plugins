import type { TabId } from '#src/recap/domain/ids.ts';
import type { Origin } from '#src/recap/domain/origin.ts';

export interface VisibilityRequest {
    readonly target: string;
    readonly hidden: boolean | 'toggle';
}

export interface CompactRequest {
    readonly tab: string;
    readonly pane: string | null;
    readonly note: string | null;
    readonly origin?: Origin;
    readonly answer?: string;
}

export interface Requests {
    request(tab: string): void;
    requestVisibility(request: VisibilityRequest): void;
    requestCompact(request: CompactRequest): void;
    requestCurate(tab: string): void;
    takeRequests(): readonly TabId[];
    takeVisibility(): readonly VisibilityRequest[];
    takeCompactions(): readonly CompactRequest[];
    takeCurations(): readonly TabId[];
    takeAnswered(): readonly { readonly pane: string; readonly answer: string }[];
}

export interface CompactionQueue {
    compactQueued(tab: string, pane: string): boolean;
}
