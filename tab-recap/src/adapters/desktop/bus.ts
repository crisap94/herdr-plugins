import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { NO, YES, type Flag } from '#src/recap/domain/gui-tab-parts.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import type { Duration, Instant } from '#src/recap/domain/time.ts';
import { BUS_RING } from './constants.ts';

export type BusTopic = 'index' | 'tab' | 'notice';

export interface BusEvent {
    readonly seq: Count;
    readonly topic: BusTopic;
    readonly tab: TabId | null;
    readonly at: Instant;
}

export interface BusRead {
    readonly seq: Count;
    readonly reset: Flag;
    readonly events: readonly BusEvent[];
}

interface Waiter {
    readonly since: Count;
    readonly release: (read: BusRead) => void;
}

export class DesktopBus {
    private readonly now: () => Instant;
    private readonly size: Count;
    private readonly ring: BusEvent[] = [];
    private readonly waiters = new Set<Waiter>();
    private last: Count = must(parseCount(0));
    private shut: Flag = NO;

    constructor(now: () => Instant, size: Count = BUS_RING) {
        this.now = now;
        this.size = size;
    }

    current(): Count {
        return this.last;
    }

    waiting(): Count {
        return must(parseCount(this.waiters.size));
    }

    publish(topic: BusTopic, tab: TabId | null): void {
        this.last = must(parseCount(this.last + 1));
        this.ring.push({ seq: this.current(), topic, tab, at: this.now() });
        while (this.ring.length > this.size) { this.ring.shift(); }
        this.wake();
    }

    since(seen: Count): BusRead {
        const first = this.ring[0];
        const lost = seen > this.last || (first !== undefined && seen < first.seq - 1);
        if (lost) { return { seq: this.current(), reset: YES, events: [] }; }
        return { seq: this.current(), reset: NO, events: this.ring.filter((event) => event.seq > seen) };
    }

    wait(seen: Count, hold: Duration, gone: AbortSignal): Promise<BusRead> {
        const now = this.since(seen);
        if (this.shut === YES || gone.aborted || now.reset === YES || now.events.length > 0) { return Promise.resolve(now); }
        return new Promise((resolve) => {
            const leave = (): void => { waiter.release(this.since(seen)); };
            const timer = setTimeout(leave, hold);
            timer.unref();
            const waiter: Waiter = {
                since: seen,
                release: (read): void => {
                    clearTimeout(timer);
                    gone.removeEventListener('abort', leave);
                    this.waiters.delete(waiter);
                    resolve(read);
                },
            };
            gone.addEventListener('abort', leave, { once: true });
            this.waiters.add(waiter);
        });
    }

    close(): void {
        this.shut = YES;
        this.wake();
    }

    private wake(): void {
        for (const waiter of this.waiters) { waiter.release(this.since(waiter.since)); }
    }
}
