import type { SessionCursor } from '#src/ports/recap-records.ts';
import type { Count } from '#src/recap/domain/count.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import type { RefreshStatus } from '#src/recap/domain/freshness.ts';
import type { HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { AgentKind, HandoffId, PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { LaneStatus } from '#src/recap/domain/status.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { ClosedView } from './closed-view.ts';

export interface HandoffLane {
    readonly tab: TabId;
    readonly pane: PaneId;
    readonly agent: AgentKind;
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
