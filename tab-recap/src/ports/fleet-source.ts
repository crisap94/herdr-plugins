import type { TokenName, TokenValue } from '#src/protocol/primitives.ts';
import type { Reconciliation } from '#src/recap/domain/fold.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Unknown } from '@stateforge-labs/session-ledger/unstable/ports/unknowable.ts';

export type { FleetSource, Frame, FrameStream, SnapshotResult, StreamResult, Topic } from './twins/legacy.ts';

export interface FleetTopic {
    readonly type: Text;
    readonly pane?: PaneId;
}

export interface FleetFrame {
    readonly event: Text;
    readonly payload: Text;
}

export interface FleetSnapshot {
    readonly kind: 'snapshot';
    readonly seen: Reconciliation;
    readonly focusedTab: TabId | null;
    readonly paneTokens: ReadonlyMap<PaneId, ReadonlyMap<TokenName, TokenValue>>;
}

export type FleetSnapshotResult = FleetSnapshot | Unknown;

export interface FleetFrames {
    frames(): AsyncIterable<FleetFrame, void, undefined>;
    close(): void;
}

export interface FleetStream {
    readonly kind: 'stream';
    readonly stream: FleetFrames;
}

export type FleetStreamResult = FleetStream | Unknown;

export interface FleetFeed {
    snapshot(): Promise<FleetSnapshotResult>;
    subscribe(topics: readonly FleetTopic[]): Promise<FleetStreamResult>;
}
