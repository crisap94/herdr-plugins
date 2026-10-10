import type { HandoffId, PaneId, TabId } from './ids.ts';
import type { StoredHandoffOutcome } from './handoff-outcome.ts';

export interface HandoffRequest {
    readonly id: HandoffId;
    readonly source: PaneId;
    readonly tab: TabId;
    readonly target: PaneId;
    readonly note: string | null;
    readonly refreshFirst: boolean;
}

export interface HandoffAnswer {
    readonly id: HandoffId;
    readonly at: number;
    readonly outcome: StoredHandoffOutcome;
}
