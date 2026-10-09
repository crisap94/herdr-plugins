// The typing lease, taken by tab-recap around every line it types into a pane: `typing-tab-recap` = its stamp, written, then read back; an earlier
// live lease of another tool holds tab-recap back (its own is cleared, and it retries). Held whatever the setting says.
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import type { PaneTokens } from '#src/ports/pane-tokens.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { LEASE, LEASE_TTL_MS, leaseBlocked } from '#src/recap/domain/typing-lease.ts';

/** how long between two tries to take the lease */
export const RETRY_MS = 1000;

export interface TypingLeaseDeps {
    readonly tokens: LaneTokens;
    readonly panes: PaneTokens;
    readonly now: () => number;
    readonly pause: (ms: number) => Promise<void>;
}

export class TypingLease {
    private readonly deps: TypingLeaseDeps;

    constructor(deps: TypingLeaseDeps) {
        this.deps = deps;
    }

    /** One try: true when the lease is tab-recap's now. */
    async take(pane: string): Promise<boolean> {
        const stamp = this.deps.now();
        const wrote = await this.deps.tokens.report(pane, { [LEASE]: String(stamp) }, LEASE_TTL_MS);
        if (isUnknown(wrote)) {
            return false;
        }
        const read = await this.deps.panes.read(pane);
        if (isUnknown(read) || leaseBlocked(read.tokens, stamp)) {
            await this.release(pane);
            return false;
        }
        return true;
    }

    /** Clears tab-recap's lease once it has typed. */
    async release(pane: string): Promise<void> {
        await this.deps.tokens.report(pane, { [LEASE]: null }, LEASE_TTL_MS);
    }

    /** Takes the lease, waiting for an earlier one to go; false when it has not gone within `waitMs` (a crashed writer's expires by itself). */
    async acquire(pane: string, waitMs: number = LEASE_TTL_MS): Promise<boolean> {
        const until = this.deps.now() + waitMs;
        let taken = await this.take(pane);
        while (!taken && this.deps.now() < until) {
            await this.deps.pause(RETRY_MS);
            taken = await this.take(pane);
        }
        return taken;
    }
}
