import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import type { PaneTokens } from '#src/ports/pane-tokens.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { LEASE, LEASE_TTL_MS, leaseBlocked } from '#src/recap/domain/typing-lease.ts';

export const RETRY_MS = 1000;

export type Acquired = 'taken' | 'busy' | 'unavailable';

export interface TypingLeaseDeps {
    readonly tokens: LaneTokens;
    readonly panes: PaneTokens;
    readonly now: () => number;
    readonly pause: (ms: number) => Promise<void>;
    readonly log: (line: string) => void;
}

export class TypingLease {
    private readonly deps: TypingLeaseDeps;
    private outage = false;

    constructor(deps: TypingLeaseDeps) {
        this.deps = deps;
    }

    private async take(pane: string): Promise<Acquired> {
        const stamp = this.deps.now();
        const wrote = await this.deps.tokens.report(pane, { [LEASE]: String(stamp) }, LEASE_TTL_MS);
        if (isUnknown(wrote)) {
            return 'unavailable';
        }
        const read = await this.deps.panes.read(pane);
        if (isUnknown(read)) {
            await this.release(pane);
            return 'unavailable';
        }
        if (leaseBlocked(read.tokens, stamp)) {
            await this.release(pane);
            return 'busy';
        }
        this.outage = false;
        return 'taken';
    }

    async release(pane: string): Promise<void> {
        await this.deps.tokens.report(pane, { [LEASE]: null }, LEASE_TTL_MS);
    }

    async acquire(pane: string, waitMs: number = LEASE_TTL_MS): Promise<Acquired> {
        const until = this.deps.now() + waitMs;
        let got = await this.take(pane);
        while (got === 'busy' && this.deps.now() < until) {
            await this.deps.pause(RETRY_MS);
            got = await this.take(pane);
        }
        if (got === 'unavailable' && !this.outage) {
            this.outage = true;
            this.deps.log('typing lease: herdr cannot take or read it; typing without it until it can');
        }
        return got;
    }
}
