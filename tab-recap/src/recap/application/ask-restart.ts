import type { Ask, AskLedger } from '#src/ports/ask-ledger.ts';

export interface RestartChannels {
    readonly token: (ask: Ask) => void;
    readonly local: (ask: Ask) => void;
}

export function interruptAsks(ledger: AskLedger, channels: RestartChannels): number {
    const asks = ledger.unfinished();
    for (const ask of asks) {
        if (ask.requester === 'cli') {
            channels.local(ask);
            ledger.settle(ask, 'interrupted');
        } else {
            channels.token(ask);
            ledger.settle(ask, 'failed-interrupted');
        }
    }
    return asks.length;
}
