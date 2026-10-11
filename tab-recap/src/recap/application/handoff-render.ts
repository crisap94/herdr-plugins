import type { LaneCursor } from '#src/ports/recap-records.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import type { RefreshStatus } from '#src/recap/domain/freshness.ts';
import type { HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { AgentKind, HandoffId, PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { LaneStatus } from '#src/recap/domain/status.ts';

export interface HandoffLane {
    readonly tab: TabId;
    readonly pane: PaneId;
    readonly agent: AgentKind;
    readonly status: LaneStatus;
    readonly cwd: string | null;
}

export interface HandoffRenderInput {
    readonly handoff: HandoffId | null;
    readonly at: number;
    readonly lane: HandoffLane;
    readonly cursor: LaneCursor | null;
    readonly facts: readonly Fact[];
    readonly note: string | null;
    readonly refresh: RefreshStatus;
}

export type RenderRefusal = Extract<HandoffOutcome, { readonly kind: 'refused'; readonly reason: 'ledger-empty' | 'content-empty' | 'too-large' }>;

export interface RenderMetrics {
    readonly bytes: number;
    readonly omitted: number;
    readonly withheld: number;
}

export type RenderedText = { readonly kind: 'text'; readonly text: string } & RenderMetrics;

export type HandoffRenderResult = RenderedText | RenderRefusal;

export type HandoffRender = (input: HandoffRenderInput) => Promise<HandoffRenderResult>;
