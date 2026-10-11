import type { ExchangeName, ToolName } from '#src/protocol/primitives.ts';
import type { RequestId } from '#src/protocol/primitives.ts';
import type { AskOutcome } from '#src/recap/domain/ask-outcome.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';

export const LOCAL_REQUESTER = 'cli';

export type Requester = ToolName | typeof LOCAL_REQUESTER;

export interface Ask {
    readonly exchange: ExchangeName;
    readonly requester: Requester;
    readonly id: RequestId;
    readonly pane: PaneId;
    readonly at: number;
    readonly ref: string | null;
    readonly outcome: AskOutcome | null;
}

export interface NewAsk {
    readonly exchange: ExchangeName;
    readonly requester: Requester;
    readonly id: RequestId;
    readonly pane: PaneId;
    readonly at: number;
    readonly ref: string | null;
}

export interface AskKey {
    readonly exchange: ExchangeName;
    readonly id: RequestId;
    readonly pane: PaneId;
}

export interface AskIdentity {
    readonly exchange: ExchangeName;
    readonly requester: Requester;
    readonly id: RequestId;
}

export interface AskLedger {
    seen(exchange: ExchangeName, requester: Requester, id: string): boolean;
    record(ask: NewAsk): void;
    attach(match: AskKey, ref: string): void;
    withdraw(identity: AskIdentity): void;
    settle(match: AskKey, outcome: AskOutcome): void;
    unfinished(): readonly Ask[];
    prune(before: number): void;
}
