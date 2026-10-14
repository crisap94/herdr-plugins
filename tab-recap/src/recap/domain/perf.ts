import { must } from '#src/protocol/result.ts';
import { parseCount } from './count.ts';
import type { Count } from './count.ts';
import { parseText } from './text.ts';
import type { Text } from './text.ts';
import type { Duration } from './time.ts';

export type PerfCounter = 'status-tracked' | 'status-full' | 'locate' | 'git-dir-event' | 'status-coalesced' | 'failed';

export const PERF_COUNTERS: readonly PerfCounter[] = ['status-tracked', 'status-full', 'locate', 'git-dir-event', 'status-coalesced', 'failed'];

export type PerfCounts = ReadonlyMap<PerfCounter, Count>;

export interface PerfWindow {
    readonly elapsed: Duration;
    readonly counts: PerfCounts;
    readonly cpu: Duration;
    readonly rss: Count;
}

export const NO_COUNTS: PerfCounts = new Map();

const MS_PER_SECOND = 1000;
const PERCENT = 100;

export function bumped(counts: PerfCounts, counter: PerfCounter): PerfCounts {
    const next = parseCount((counts.get(counter) ?? 0) + 1);
    if (next.kind === 'err') {
        return counts;
    }
    const merged = new Map(counts);
    merged.set(counter, next.value);
    return merged;
}

export function perfLine(window: PerfWindow): Text {
    const seconds = Math.round(window.elapsed / MS_PER_SECOND);
    const counted = PERF_COUNTERS.map((counter) => `${counter}=${window.counts.get(counter) ?? 0}`);
    const share = window.elapsed === 0 ? 0 : Math.round((window.cpu / window.elapsed) * PERCENT);
    return must(parseText(['perf', `window=${seconds}s`, ...counted, `cpu=${Math.round(window.cpu)}ms`, `cpu-share=${share}%`, `rss=${window.rss}MiB`].join(' ')));
}
