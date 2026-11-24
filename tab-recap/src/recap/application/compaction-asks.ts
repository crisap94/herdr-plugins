import type { AskBook } from '#src/ports/ask-ledger.ts';
import type { CompactAsk } from '#src/ports/requests.ts';
import { COMPACT_EXCHANGE, parseAskId } from '#src/recap/domain/compact-request.ts';
import type { SessionKey } from '#src/recap/domain/ids.ts';
import type { Text } from '@stateforge-labs/session-ledger';

export function linkAsk(asks: Pick<AskBook, 'attach'> | undefined, request: CompactAsk | null, pane: SessionKey, ref: Text): void {
    const id = request?.answer === undefined ? null : parseAskId(request.answer);
    if (id !== null) {
        asks?.attach({ exchange: COMPACT_EXCHANGE, id, pane }, ref);
    }
}
