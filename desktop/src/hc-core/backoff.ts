import { must } from '../kernel/result.ts';
import { parseCount, type Count } from '../kernel/count.ts';
import type { Duration } from '../kernel/time.ts';
import { nextBackoff } from './wire.ts';

export interface BackoffTiming {
    readonly backoffBase: Duration;
    readonly backoffCap: Duration;
}

export type RetryPhase = 'idle' | 'waiting';

export type TimerHold = 'holds-process' | 'lets-process-end';

const ZERO = must(parseCount(0));
const ONE = must(parseCount(1));

export class Backoff {
    private readonly timing: BackoffTiming;
    private readonly hold: TimerHold;
    private failures: Count = ZERO;
    private retry: NodeJS.Timeout | null = null;
    private proven: NodeJS.Timeout | null = null;

    constructor(timing: BackoffTiming, hold: TimerHold) {
        this.timing = timing;
        this.hold = hold;
    }

    get phase(): RetryPhase {
        return this.retry === null ? 'idle' : 'waiting';
    }

    schedule(run: () => void): void {
        this.stop();
        const delay = nextBackoff(this.failures, this.timing.backoffBase, this.timing.backoffCap);
        this.failures = must(parseCount(this.failures + ONE));
        this.retry = this.timer(() => { this.retry = null; run(); }, delay);
    }

    survive(): void {
        this.clear(this.proven);
        this.proven = setTimeout(() => { this.proven = null; this.failures = ZERO; }, this.timing.backoffCap);
        this.proven.unref();
    }

    stop(): void {
        this.clear(this.retry);
        this.clear(this.proven);
        this.retry = null;
        this.proven = null;
    }

    private timer(run: () => void, delay: Duration): NodeJS.Timeout {
        const timer = setTimeout(run, delay);
        if (this.hold === 'lets-process-end') {
            timer.unref();
        }
        return timer;
    }

    private clear(timer: NodeJS.Timeout | null): void {
        if (timer !== null) {
            clearTimeout(timer);
        }
    }
}
