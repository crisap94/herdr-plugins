import { withTypingLease as leased } from '@stateforge-labs/herdr-sdk/typing';
import type { Acquired } from './typing-lease.ts';

export interface Lease {
    acquire(): Promise<Acquired>;
    release(): Promise<void>;
}

export type { Leased } from '@stateforge-labs/herdr-sdk/typing';

export function withTypingLease<T>(lease: Lease | undefined, run: () => Promise<T>): ReturnType<typeof leased<T>> {
    return leased(lease === undefined ? undefined : { acquire: () => lease.acquire(), release: () => lease.release() }, '', run);
}
