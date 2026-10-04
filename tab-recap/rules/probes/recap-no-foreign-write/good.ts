import type { RecapStore } from '#src/ports/recap-store.ts';

export function publish(store: RecapStore): void {
    store.request('w1:t1');
}
