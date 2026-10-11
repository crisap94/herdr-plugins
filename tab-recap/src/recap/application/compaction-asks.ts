import type { AskLedger } from '#src/ports/ask-ledger.ts';
import type { CompactRequest } from '#src/ports/requests.ts';
import { COMPACT_EXCHANGE, parseAskId } from '#src/recap/domain/compact-request.ts';
import { paneId } from '#src/recap/domain/ids.ts';

export function linkAsk(asks: Pick<AskLedger, 'attach'> | undefined, request: CompactRequest | null, pane: string, ref: string): void {
    const id = request?.answer === undefined ? null : parseAskId(request.answer);
    if (id !== null) {
        asks?.attach({ exchange: COMPACT_EXCHANGE, id, pane: paneId(pane) }, ref);
    }
}
