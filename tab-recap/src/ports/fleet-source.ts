import type { Reconciliation } from '#src/recap/domain/fold.ts';
import type { Unknown } from './unknowable.ts';
export type { AgentSession } from '#src/recap/domain/ids.ts';

export interface Topic {
    readonly type: string;
    readonly pane_id?: string;
}

export interface Frame {
    readonly event: string;
    readonly data: Readonly<Record<string, unknown>>;
}

export type SnapshotResult = { readonly kind: 'snapshot'; readonly seen: Reconciliation; readonly focusedTab: string | null } | Unknown;

export interface FrameStream {
    frames(): AsyncIterable<Frame>;
    close(): void;
}

export type StreamResult = { readonly kind: 'stream'; readonly stream: FrameStream } | Unknown;

export interface FleetSource {
    snapshot(): Promise<SnapshotResult>;
    subscribe(topics: readonly Topic[]): Promise<StreamResult>;
}
