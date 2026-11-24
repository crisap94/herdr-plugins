import { must } from '@stateforge-labs/session-ledger';
import { parseCount, type Count } from '@stateforge-labs/session-ledger';
import { parseMilliseconds, type Milliseconds } from '@stateforge-labs/session-ledger';


export type Job<T, R> = (item: T, index: Count, lane: Count) => Promise<R>;

export async function pooledBy<T, R>(items: readonly T[], limit: Count, job: Job<T, R>): Promise<R[]> {
    const results: R[] = Array.from({ length: items.length });
    const queue = items.entries();
    const run = async (lane: Count): Promise<void> => {
        for (const [at, item] of queue) results[at] = await job(item, must(parseCount(at)), lane);
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, (_, lane) => run(must(parseCount(lane)))));
    return results;
}

export type Usable = 'usable' | 'unusable';

export interface Retry {
    readonly onRetry?: (attempt: Count, wait: Milliseconds) => void;
    readonly sleep?: (wait: Milliseconds) => Promise<void>;
    readonly attempts?: Count;
    readonly baseMs?: Milliseconds;
}

const pause = (wait: Milliseconds): Promise<void> => new Promise<void>((resolve) => { setTimeout(resolve, wait); });

export async function retriedBy<R>(attempt: () => Promise<R>, usable: (answer: R) => Usable, options: Retry = {}): Promise<R> {
    const [attempts, base, sleep] = [options.attempts ?? 4, options.baseMs ?? 15_000, options.sleep ?? pause];
    let answer = await attempt();
    for (let n = 1; n < attempts && usable(answer) === 'unusable'; n += 1) {
        const wait = must(parseMilliseconds(base * 2 ** (n - 1)));
        options.onRetry?.(must(parseCount(n)), wait);
        await sleep(wait);
        answer = await attempt();
    }
    return answer;
}
