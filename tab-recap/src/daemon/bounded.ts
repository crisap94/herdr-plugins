import type { Duration } from '#src/recap/domain/time.ts';

export { bounded, within } from './legacy.ts';

export type Bounded = 'done' | 'timeout';

export async function boundedBy(task: Promise<void>, limit: Duration): Promise<Bounded> {
    const waiting: { timer?: ReturnType<typeof setTimeout> } = {};
    const late = new Promise<'timeout'>((resolve) => { waiting.timer = setTimeout(() => { resolve('timeout'); }, limit); });
    try {
        return await Promise.race([task.then((): 'done' => 'done'), late]);
    } finally {
        clearTimeout(waiting.timer);
    }
}

export async function withinBy<T>(task: Promise<T>, limit: Duration, fallback: T): Promise<T> {
    const waiting: { timer?: ReturnType<typeof setTimeout> } = {};
    const late = new Promise<T>((resolve) => { waiting.timer = setTimeout(() => { resolve(fallback); }, limit); });
    try {
        return await Promise.race([task, late]);
    } finally {
        clearTimeout(waiting.timer);
    }
}
