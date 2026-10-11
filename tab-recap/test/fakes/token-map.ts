import type { TokenMap, TokenWrite } from '#src/protocol/tokens.ts';

export type TokenEvent = { readonly name: string; readonly value: string | null };

export class FakeTokenMap {
    readonly #values = new Map<string, string>();
    readonly events: TokenEvent[] = [];

    snapshot(): TokenMap {
        return Object.fromEntries(this.#values);
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
