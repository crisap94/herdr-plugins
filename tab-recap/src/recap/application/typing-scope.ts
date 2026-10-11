import type { Acquired } from './typing-lease.ts';

export interface Lease {
    acquire(): Promise<Acquired>;
    release(): Promise<void>;
}

export type Leased<T> = { readonly kind: 'busy' } | { readonly kind: 'ran'; readonly value: T };

export async function withTypingLease<T>(lease: Lease | undefined, run: () => Promise<T>): Promise<Leased<T>> {
    if (lease === undefined) {
        return { kind: 'ran', value: await run() };
    }
    const acquired = await lease.acquire();
    if (acquired === 'busy') {
        return { kind: 'busy' };
    }
    try {
        return { kind: 'ran', value: await run() };
    } finally {
        if (acquired === 'taken') {
            await lease.release();
        }
    }
}
