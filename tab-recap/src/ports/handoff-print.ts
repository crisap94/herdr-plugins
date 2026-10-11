import type { HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { ClosedLaneIdentity } from '#src/recap/domain/closures.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';

export interface PrintRequest {
    readonly from: PaneId;
    readonly to: PaneId | null;
    readonly note: string | null;
    readonly closed: ClosedLaneIdentity | null;
}

export type PrintResult =
    | { readonly kind: 'text'; readonly text: string; readonly info: string | null }
    | Extract<HandoffOutcome, { readonly kind: 'refused' | 'failed' }>;

export interface HandoffPrinter {
    renderForPrint(request: PrintRequest): Promise<PrintResult>;
}
