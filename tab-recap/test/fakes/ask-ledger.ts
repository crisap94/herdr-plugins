import type { AskEntry, AskIdentity, AskKey, AskBook, AskDraft, AskSighting, Requester } from '#src/ports/ask-ledger.ts';
import { parseRequestId } from '#src/protocol/primitives.ts';
import type { ExchangeName, RequestId } from '#src/protocol/primitives.ts';
import { must } from '@stateforge-labs/session-ledger';
import type { Text } from '@stateforge-labs/session-ledger';
import type { Instant } from '@stateforge-labs/session-ledger';
import type { AskOutcome } from '#src/recap/domain/ask-outcome.ts';

export const rid = (raw: string): RequestId => must(parseRequestId(raw, 'legacy-length'));

const keyOf = (exchange: ExchangeName, requester: Requester, id: string): string => `${exchange}\u0000${requester}\u0000${id}`;

export class MemoryAskLedger implements AskBook {
    private readonly rows = new Map<string, AskEntry>();

    seen(exchange: ExchangeName, requester: Requester, id: RequestId): AskSighting {
        return this.rows.has(keyOf(exchange, requester, id)) ? 'seen' : 'unseen';
    }

    record(ask: AskDraft): void {
        const key = keyOf(ask.exchange, ask.requester, ask.id);
        if (!this.rows.has(key)) {
            this.rows.set(key, { ...ask, outcome: null });
        }
    }

    attach(match: AskKey, ref: Text): void {
        for (const [key, ask] of this.rows) {
            if (ask.exchange === match.exchange && ask.id === match.id && ask.pane === match.pane && ask.ref === null) {
                this.rows.set(key, { ...ask, ref });
            }
        }
    }

    withdraw(identity: AskIdentity): void {
        const key = keyOf(identity.exchange, identity.requester, identity.id);
        if (this.rows.get(key)?.outcome === null) {
            this.rows.delete(key);
        }
    }

    settle(match: AskKey, outcome: AskOutcome): void {
        for (const [key, ask] of this.rows) {
            if (ask.exchange === match.exchange && ask.id === match.id && ask.pane === match.pane && ask.outcome === null) {
                this.rows.set(key, { ...ask, outcome });
            }
        }
    }

    unfinished(): readonly AskEntry[] {
        return [...this.rows.values()].filter((ask) => ask.outcome === null).toSorted((a, b) => a.at - b.at || a.requester.localeCompare(b.requester) || a.id.localeCompare(b.id));
    }

    prune(before: Instant): void {
        for (const [key, ask] of this.rows) {
            if (ask.at < before && ask.outcome !== null) {
                this.rows.delete(key);
            }
        }
    }
}
