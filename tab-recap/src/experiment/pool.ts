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
    readonly onRetry?: (attempt: number, waitMs: number) => void;
    readonly sleep?: (ms: number) => Promise<void>;
    readonly attempts?: number;
    readonly baseMs?: number;
}

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
