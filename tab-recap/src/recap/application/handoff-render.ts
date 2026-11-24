import type { SessionCursor } from '@stateforge-labs/session-ledger';
import type { Count } from '@stateforge-labs/session-ledger';
import type { Fact } from '@stateforge-labs/session-ledger';
import type { RefreshStatus } from '#src/recap/domain/freshness.ts';
import type { HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { HarnessKind, HandoffId, SessionKey, ScopeId } from '#src/recap/domain/ids.ts';
import type { LaneStatus } from '#src/recap/domain/status.ts';
import type { Text } from '@stateforge-labs/session-ledger';
import type { Instant } from '@stateforge-labs/session-ledger';
import type { ClosedView } from './closed-view.ts';

export interface HandoffLane {
    readonly tab: ScopeId;
    readonly pane: SessionKey;
    readonly agent: HarnessKind;
    readonly status: LaneStatus;
    readonly cwd: Text | null;
}

export interface HandoffRenderInput {
    readonly handoff: HandoffId | null;
    readonly at: Instant;
    readonly lane: HandoffLane;
    readonly cursor: SessionCursor | null;
    readonly facts: readonly Fact[];
    readonly note: Text | null;
    readonly refresh: RefreshStatus;
    readonly closed?: ClosedView;
}

export type RenderRefusal = Extract<HandoffOutcome, { readonly kind: 'refused'; readonly reason: 'ledger-empty' | 'content-empty' | 'too-large' }>;

export interface RenderMetrics {
    readonly bytes: Count;
    readonly omitted: Count;
    readonly withheld: Count;
}

export type RenderedText = { readonly kind: 'text'; readonly text: Text } & RenderMetrics;

export type RenderFailure = Extract<HandoffOutcome, { readonly kind: 'failed'; readonly reason: 'source-unreadable' }>;

export type HandoffRenderResult = RenderedText | RenderRefusal | RenderFailure;

export type HandoffRender = (input: HandoffRenderInput) => Promise<HandoffRenderResult>;
