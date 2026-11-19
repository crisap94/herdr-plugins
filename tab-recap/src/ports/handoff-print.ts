import type { HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { ClosedLaneIdentity } from '#src/recap/domain/closures.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';
import type { Text } from '#src/recap/domain/text.ts';

export type { HandoffPrinter, PrintRequest, PrintResult } from './legacy.ts';

export interface PrintAsk {
    readonly from: PaneId;
    readonly to: PaneId | null;
    readonly note: Text | null;
    readonly closed: ClosedLaneIdentity | null;
}

export interface PrintedText {
    readonly kind: 'text';
    readonly text: Text;
    readonly info: Text | null;
}

export type PrintAnswer = PrintedText | Extract<HandoffOutcome, { readonly kind: 'refused' | 'failed' }>;

export interface HandoffPrintService {
    renderForPrint(request: PrintAsk): Promise<PrintAnswer>;
}
