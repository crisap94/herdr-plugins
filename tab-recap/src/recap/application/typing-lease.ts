// The typing lease, taken by tab-recap around each compaction line it types into a pane: `typing-tab-recap` = its stamp, written, then the pane's
// tokens read back; an earlier live lease of another tool holds tab-recap back (its own is cleared, and it retries). When herdr cannot take or read
// tokens (no such method, unreachable), the lease fails open: the line is typed without it, and one line says so per outage. Held whatever the setting says.
//
// Limit of the protocol as written: the stamp is taken before the write, so a tool whose earlier stamp lands after tab-recap's read can overlap it.
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import type { PaneTokens } from '#src/ports/pane-tokens.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { LEASE, LEASE_TTL_MS, leaseBlocked } from '#src/recap/domain/typing-lease.ts';

/** how long between two tries to take the lease */
export const RETRY_MS = 1000;

/** `taken`: tab-recap holds it; `busy`: another tool's is live; `unavailable`: herdr cannot say, so the line is typed without one. */
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

    /** One try. */
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

    /** Clears tab-recap's lease once it has typed (or given up). */
    async release(pane: string): Promise<void> {
        await this.deps.tokens.report(pane, { [LEASE]: null }, LEASE_TTL_MS);
    }

    /** Takes the lease, waiting for an earlier one to go for at most `waitMs`; herdr unable to say is `unavailable` at once, and logged once. */
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
