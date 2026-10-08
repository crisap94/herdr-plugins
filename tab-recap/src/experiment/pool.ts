// Run async jobs with a concurrency limit, and retry the ones that say "try later" with a growing wait. Generic; no I/O of its own.

/** Run `job` on every item, at most `limit` at a time (`lane` is the slot, 0..limit-1, that no other running job holds); results come back in item order. */
export async function pooled<T, R>(items: readonly T[], limit: number, job: (item: T, index: number, lane: number) => Promise<R>): Promise<R[]> {
    const results: R[] = Array.from({ length: items.length });
    let next = 0;
    const run = async (lane: number): Promise<void> => {
        for (let at = next++; at < items.length; at = next++) results[at] = await job(items[at] as T, at, lane);
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, (_, lane) => run(lane)));
    return results;
}

export interface Backoff {
    /** called with the 1-based attempt that failed, and how long it will wait */
    readonly onRetry?: (attempt: number, waitMs: number) => void;
    readonly sleep?: (ms: number) => Promise<void>;
    readonly attempts?: number;
    readonly baseMs?: number;
}

/** Call `attempt` until `usable` accepts its answer, up to `attempts` times, waiting baseMs, 2×, 4×… between. The last answer is returned either way. */
export async function retried<R>(attempt: () => Promise<R>, usable: (answer: R) => boolean, options: Backoff = {}): Promise<R> {
    const [attempts, base, sleep] = [options.attempts ?? 4, options.baseMs ?? 15_000, options.sleep ?? ((ms: number): Promise<void> => new Promise<void>((resolve) => { setTimeout(resolve, ms); }))];
    let answer = await attempt();
    for (let n = 1; n < attempts && !usable(answer); n += 1) {
        const wait = base * 2 ** (n - 1);
        options.onRetry?.(n, wait);
        await sleep(wait);
        answer = await attempt();
    }
    return answer;
}
