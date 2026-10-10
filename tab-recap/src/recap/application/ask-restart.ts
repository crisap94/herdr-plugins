import type { Ask, AskLedger } from '#src/ports/ask-ledger.ts';
import { COMPACT_FAILURES } from '#src/protocol/exchanges/compact.ts';
import type { AskOutcome } from '#src/recap/domain/ask-outcome.ts';

export interface RestartChannels {
    readonly token: (ask: Ask) => void;
    readonly local: (ask: Ask) => void;
}

const INTERRUPTED: AskOutcome = { kind: 'interrupted' };
const FAILED_INTERRUPTED: AskOutcome = { kind: 'failed', reason: COMPACT_FAILURES.interrupted };

export function interruptAsks(ledger: AskLedger, channels: RestartChannels): number {
    const asks = ledger.unfinished();
    for (const ask of asks) {
        if (ask.requester === 'cli') {
            channels.local(ask);
            ledger.settle(ask, INTERRUPTED);
        } else {
            channels.token(ask);
            ledger.settle(ask, FAILED_INTERRUPTED);
        }
    }
    return asks.length;
}
