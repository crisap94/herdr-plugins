import type { TokenSnapshot } from '#src/protocol/requester.ts';
import { parseTokenName, parseTokenValue } from '#src/protocol/primitives.ts';
import type { TokenName, TokenValue } from '#src/protocol/primitives.ts';
import { must } from '@stateforge-labs/session-ledger';
import type { TokenMap, TokenWrite } from '#src/protocol/tokens.ts';

export const snapshotOf = (tokens: Readonly<Record<string, string>>): TokenSnapshot =>
    Object.fromEntries(
        Object.entries(tokens).map(([name, value]): readonly [TokenName, TokenValue] => [must(parseTokenName(name)), must(parseTokenValue(value))]),
    );

export type TokenEvent = { readonly name: string; readonly value: string | null };

export class FakeTokenMap {
    readonly #values = new Map<string, string>();
    readonly events: TokenEvent[] = [];

    snapshot(): TokenMap {
        return Object.fromEntries(this.#values);
    }

    tokenSnapshot(): TokenSnapshot {
        return snapshotOf(this.snapshot());
    }

    write(name: string, value: string): void {
        this.#values.set(name, value);
        this.events.push({ name, value });
    }

    apply(writes: readonly TokenWrite[]): void {
        for (const { name, value } of writes) {
            if (value === null) {
                this.clear(name);
            } else {
                this.write(name, value);
            }
        }
    }

    rewriteUnchangedNoEvent(name: string, value: string): void {
        this.#values.set(name, value);
    }

    collapseBurst(name: string, values: readonly string[]): void {
        const last = values.at(-1);
        if (last !== undefined) {
            this.write(name, last);
        }
    }

    expire(name: string): void {
        this.#remove(name);
    }

    clear(name: string): void {
        this.#remove(name);
    }

    #remove(name: string): void {
        this.#values.delete(name);
        this.events.push({ name, value: null });
    }
}
