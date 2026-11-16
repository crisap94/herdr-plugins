import { unknown as unknownOf, type Unknown, type Unknowable } from '@stateforge-labs/session-ledger';

export type Settled<T> =
    | { readonly kind: 'answer'; readonly value: T }
    | { readonly kind: 'fail'; readonly why: Unknowable }
    | { readonly kind: 'throw'; readonly message: string };

export type Behaviour<T> = Settled<T> | { readonly kind: 'block'; readonly after: Settled<T> };

export type Run = <T>(behaviour: Behaviour<T>) => Promise<T | Unknown>;

export interface Gate {
    readonly opened: Promise<void>;
    open(): void;
}

export const gateOf = (): Gate => {
    let release: (() => void) | null = null;
    const opened = new Promise<void>((resolve) => {
        release = resolve;
    });
    return {
        opened,
        open: () => release?.(),
    };
};

export const settle = <T>(settled: Settled<T>): Promise<T | Unknown> => {
    if (settled.kind === 'answer') {
        return Promise.resolve(settled.value);
    }
    if (settled.kind === 'fail') {
        return Promise.resolve(unknownOf(settled.why));
    }
    return Promise.reject(new Error(settled.message));
};

export const runnerOf =
    (opened: Promise<void>): Run =>
    (behaviour) => {
        if (behaviour.kind === 'block') {
            return opened.then(() => settle(behaviour.after));
        }
        return settle(behaviour);
    };
