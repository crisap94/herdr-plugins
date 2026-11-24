import { must } from '@stateforge-labs/session-ledger';
import type { HandoffPrintService, PrintAnswer } from '#src/ports/handoff-print.ts';
import type { TabViewStore } from '#src/ports/tab-views.ts';
import { unknown, type Unknown, exitCodeOf } from '@stateforge-labs/session-ledger';
import { causeOf } from '@stateforge-labs/session-ledger';
import type { HandoffReason } from '#src/recap/domain/handoff-outcome.ts';
import type { SessionKey, ScopeId } from '#src/recap/domain/ids.ts';
import { parseText, type Text } from '@stateforge-labs/session-ledger';

export type HandoffRead =
    | { readonly kind: 'text'; readonly text: Text }
    | { readonly kind: 'refused'; readonly reason: HandoffReason }
    | { readonly kind: 'unknown-pane' }
    | Unknown;

export interface HandoffMessageDeps {
    readonly printer: HandoffPrintService;
    readonly views: Pick<TabViewStore, 'tabOf'>;
}

function readOf(printed: PrintAnswer): HandoffRead {
    switch (printed.kind) {
        case 'text':
            return { kind: 'text', text: must(parseText(printed.text)) };
        case 'refused':
            return { kind: 'refused', reason: printed.reason };
        default:
            return unknown({ why: 'failed', code: exitCodeOf(1), detail: causeOf(must(parseText(printed.reason))) });
    }
}

export async function handoffMessageOf(deps: HandoffMessageDeps, tab: ScopeId, from: SessionKey, to: SessionKey | null): Promise<HandoffRead> {
    if (deps.views.tabOf(from) !== tab) { return { kind: 'unknown-pane' }; }
    try {
        return readOf(await deps.printer.renderForPrint({ from, to, note: null, closed: null }));
    } catch (failure) {
        return unknown({ why: 'unreadable', detail: causeOf(must(parseText(failure instanceof Error ? failure.message : String(failure)))) });
    }
}
