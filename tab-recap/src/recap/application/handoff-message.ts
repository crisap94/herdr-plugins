import { must } from '#src/protocol/result.ts';
import type { HandoffPrinter, PrintResult } from '#src/ports/handoff-print.ts';
import type { TabViews } from '#src/ports/tab-views.ts';
import { unknown, type Unknown } from '#src/ports/unknowable.ts';
import type { HandoffReason } from '#src/recap/domain/handoff-outcome.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';

export type HandoffRead =
    | { readonly kind: 'text'; readonly text: Text }
    | { readonly kind: 'refused'; readonly reason: HandoffReason }
    | { readonly kind: 'unknown-pane' }
    | Unknown;

export interface HandoffMessageDeps {
    readonly printer: HandoffPrinter;
    readonly views: Pick<TabViews, 'tabOf'>;
}

function readOf(printed: PrintResult): HandoffRead {
    switch (printed.kind) {
        case 'text':
            return { kind: 'text', text: must(parseText(printed.text)) };
        case 'refused':
            return { kind: 'refused', reason: printed.reason };
        default:
            return unknown({ why: 'failed', code: 1, detail: printed.reason });
    }
}

export async function handoffMessageOf(deps: HandoffMessageDeps, tab: TabId, from: PaneId, to: PaneId | null): Promise<HandoffRead> {
    if (deps.views.tabOf(from) !== tab) { return { kind: 'unknown-pane' }; }
    try {
        return readOf(await deps.printer.renderForPrint({ from, to, note: null, closed: null }));
    } catch (failure) {
        return unknown({ why: 'unreadable', detail: failure instanceof Error ? failure.message : String(failure) });
    }
}
