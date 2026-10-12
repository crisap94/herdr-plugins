import type { DatabaseSync } from 'node:sqlite';
import type { AskLedger, NewAsk } from '#src/ports/ask-ledger.ts';
import type { HandoffQueue, HandoffRequester, NewHandoffRequest } from '#src/ports/requests.ts';
import { writeTx } from './connection.ts';

export class HandoffQueueRepository implements HandoffQueue {
    private readonly db: DatabaseSync;
    private readonly asks: AskLedger;
    private readonly requests: HandoffRequester;

    constructor(db: DatabaseSync, asks: AskLedger, requests: HandoffRequester) {
        this.db = db;
        this.asks = asks;
        this.requests = requests;
    }

    queueHandoff(ask: NewAsk, request: NewHandoffRequest): void {
        writeTx(this.db, () => {
            this.asks.record(ask);
            const id = this.requests.requestHandoff(request);
            this.asks.attach(ask, id);
        });
    }
}
