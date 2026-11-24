import type { Database } from 'bun:sqlite';
import type { AskBook, AskDraft } from '#src/ports/ask-ledger.ts';
import type { HandoffAsk, HandoffAskQueue, HandoffAsker } from '#src/ports/requests.ts';
import { textOf } from '@stateforge-labs/session-ledger';
import { writeTransaction } from '@stateforge-labs/session-ledger-sqlite/unstable/connection.ts';

export class HandoffQueueRepository implements HandoffAskQueue {
    private readonly db: Database;
    private readonly asks: AskBook;
    private readonly requests: HandoffAsker;

    constructor(db: Database, asks: AskBook, requests: HandoffAsker) {
        this.db = db;
        this.asks = asks;
        this.requests = requests;
    }

    queueHandoff(ask: AskDraft, request: HandoffAsk): void {
        writeTransaction(this.db, () => {
            this.asks.record(ask);
            const id = this.requests.requestHandoff(request);
            this.asks.attach(ask, textOf(id));
        });
    }
}
