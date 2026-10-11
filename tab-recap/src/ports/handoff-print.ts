import type { HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';

export interface PrintRequest {
    readonly from: PaneId;
    readonly to: PaneId | null;
    readonly note: string | null;
}

export type PrintResult =
    | { readonly kind: 'text'; readonly text: string }
    | Extract<HandoffOutcome, { readonly kind: 'refused' }>;

export interface HandoffPrinter {
    renderForPrint(request: PrintRequest): Promise<PrintResult>;
}
