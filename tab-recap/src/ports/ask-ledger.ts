import type { ExchangeName, ToolName } from '#src/protocol/primitives.ts';

export type Requester = ToolName | 'cli';

export interface Ask {
    readonly exchange: ExchangeName;
    readonly requester: Requester;
    readonly id: string;
    readonly pane: string;
    readonly at: number;
    readonly ref: string | null;
    readonly outcome: string | null;
}

export interface AskKey {
    readonly exchange: ExchangeName;
    readonly id: string;
    readonly pane: string;
}

export interface AskLedger {
    seen(exchange: ExchangeName, requester: Requester, id: string): boolean;
    record(ask: Omit<Ask, 'outcome'>): void;
    settle(match: AskKey, outcome: string): void;
    unfinished(): readonly Ask[];
    prune(before: number): void;
}
