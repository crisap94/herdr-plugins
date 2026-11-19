import type { NewAsk } from '#src/ports/ask-ledger.ts';
import type { HandoffId, PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { HandoffSource } from '#src/recap/domain/handoff-source.ts';
import type { Origin } from '#src/recap/domain/origin.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';

export type {
    AnswerRow,
    CompactRequest,
    CompactionQueue,
    HandoffRequestRow,
    HandoffRequester,
    HandoffResponder,
    NewHandoffRequest,
    Requests,
    VisibilityRequest,
} from './twins/runs/legacy.ts';
export type { HandoffQueue } from './legacy.ts';

export type Visibility = 'hidden' | 'shown' | 'toggle';

export type RefreshFirst = 'refresh-first' | 'as-is';

export type Withdrawal = 'withdrawn' | 'not-found';

export type Queued = 'queued' | 'not-queued';

export interface VisibilityAsk {
    readonly target: PaneId;
    readonly visibility: Visibility;
}

export interface CompactAsk {
    readonly tab: TabId;
    readonly pane: PaneId | null;
    readonly note: Text | null;
    readonly origin?: Origin;
    readonly answer?: Text;
}

export interface HandoffAskRecord {
    readonly id: HandoffId;
    readonly at: Instant;
    readonly tab: TabId;
    readonly pane: PaneId;
    readonly toPane: PaneId;
    readonly refresh: RefreshFirst;
    readonly note: Text | null;
    readonly source: HandoffSource;
    readonly answer?: Text | null;
}

export interface HandoffAsk {
    readonly tab: TabId;
    readonly pane: PaneId;
    readonly toPane: PaneId;
    readonly note: Text | null;
    readonly refresh: RefreshFirst;
    readonly source: HandoffSource;
    readonly answer?: Text;
}

export interface HandoffAsker {
    requestHandoff(request: HandoffAsk): HandoffId;
    withdrawHandoff(id: HandoffId): Withdrawal;
}

export interface HandoffAskQueue {
    queueHandoff(ask: NewAsk, request: HandoffAsk): void;
}

export interface HandoffTaker {
    takeHandoffs(): readonly HandoffAskRecord[];
}

export interface AnsweredPane {
    readonly pane: PaneId;
    readonly answer: Text;
}

export interface RequestPort extends HandoffAsker, HandoffTaker {
    request(tab: TabId): void;
    requestVisibility(request: VisibilityAsk): void;
    requestCompact(request: CompactAsk): void;
    requestCurate(tab: TabId): void;
    takeRequests(): readonly TabId[];
    takeVisibility(): readonly VisibilityAsk[];
    takeCompactions(): readonly CompactAsk[];
    takeCurations(): readonly TabId[];
    takeAnswered(): readonly AnsweredPane[];
}

export interface CompactionAskQueue {
    compactQueued(tab: TabId, pane: PaneId): Queued;
}
