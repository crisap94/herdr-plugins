import type { Ask, AskKey, AskLedger, Requester } from '#src/ports/ask-ledger.ts';
import type { ExchangeName } from '#src/protocol/primitives.ts';

const keyOf = (exchange: ExchangeName, requester: Requester, id: string): string => `${exchange}\u0000${requester}\u0000${id}`;

export class MemoryAskLedger implements AskLedger {
    private readonly rows = new Map<string, Ask>();

    seen(exchange: ExchangeName, requester: Requester, id: string): boolean {
        return this.rows.has(keyOf(exchange, requester, id));
    }

    record(ask: Omit<Ask, 'outcome'>): void {
        const key = keyOf(ask.exchange, ask.requester, ask.id);
        if (!this.rows.has(key)) {
            this.rows.set(key, { ...ask, outcome: null });
        }
    }

    settle(match: AskKey, outcome: string): void {
        for (const [key, ask] of this.rows) {
            if (ask.exchange === match.exchange && ask.id === match.id && ask.pane === match.pane && ask.outcome === null) {
                this.rows.set(key, { ...ask, outcome });
            }
        }
    }

    unfinished(): readonly Ask[] {
        return [...this.rows.values()].filter((ask) => ask.outcome === null).toSorted((a, b) => a.at - b.at || a.requester.localeCompare(b.requester) || a.id.localeCompare(b.id));
    }

    prune(before: number): void {
        for (const [key, ask] of this.rows) {
            if (ask.at < before && ask.outcome !== null) {
                this.rows.delete(key);
            }
        }
    }
}
