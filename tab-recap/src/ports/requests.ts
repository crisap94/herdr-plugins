import type { HandoffId, PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { HandoffSource } from '#src/recap/domain/handoff-source.ts';
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

export interface HandoffRequestRow {
    readonly id: HandoffId;
    readonly at: number;
    readonly tab: TabId;
    readonly pane: PaneId;
    readonly toPane: PaneId;
    readonly refreshFirst: boolean;
    readonly note: string | null;
    readonly source: HandoffSource;
}

export interface NewHandoffRequest {
    readonly tab: TabId;
    readonly pane: PaneId;
    readonly toPane: PaneId;
    readonly note: string | null;
    readonly refreshFirst: boolean;
    readonly source: HandoffSource;
}

export interface HandoffRequester {
    requestHandoff(request: NewHandoffRequest): HandoffId;
    withdrawHandoff(id: HandoffId): boolean;
}

export interface HandoffResponder {
    takeHandoffs(): readonly HandoffRequestRow[];
}

export interface Requests extends HandoffRequester, HandoffResponder {
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
