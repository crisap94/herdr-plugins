import type { LaneTokenReporter } from '#src/ports/lane-tokens.ts';
import type { PaneTokens } from '#src/ports/pane-tokens.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { uncheckedMilliseconds, uncheckedTokenName, uncheckedTokenValue, type PaneId } from '#src/recap/domain/ids.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { parseMilliseconds, type Instant, type Milliseconds } from '#src/recap/domain/time.ts';
import { LEASE, LEASE_TTL_MS, leaseBlocked } from '#src/recap/domain/typing-lease.ts';

export const RETRY_MS = must(parseMilliseconds(1000));
const LEASE_WAIT_MS = must(parseMilliseconds(LEASE_TTL_MS));
const LEASE_TTL = uncheckedMilliseconds(LEASE_TTL_MS);
const LEASE_NAME = uncheckedTokenName(LEASE);

export type Acquired = 'taken' | 'busy' | 'unavailable';

export interface PaneTypingLeaseDeps {
    readonly tokens: LaneTokenReporter;
    readonly panes: PaneTokens;
    readonly now: () => Instant;
    readonly pause: (ms: Milliseconds) => Promise<void>;
    readonly log: (line: Text) => void;
}

export class PaneTypingLease {
    private readonly deps: PaneTypingLeaseDeps;
    private outage = false;

    constructor(deps: PaneTypingLeaseDeps) {
        this.deps = deps;
    }

    private async take(pane: PaneId): Promise<Acquired> {
        const stamp = this.deps.now();
        const wrote = await this.deps.tokens.report(pane, new Map([[LEASE_NAME, uncheckedTokenValue(String(stamp))]]), LEASE_TTL);
        if (isUnknown(wrote)) {
            return 'unavailable';
        }
        const read = await this.deps.panes.read(pane);
        if (isUnknown(read)) {
            await this.release(pane);
            return 'unavailable';
        }
        if (leaseBlocked(read.tokens, stamp) === 'blocked') {
            await this.release(pane);
            return 'busy';
        }
        this.outage = false;
        return 'taken';
    }

    async release(pane: PaneId): Promise<void> {
        await this.deps.tokens.report(pane, new Map([[LEASE_NAME, null]]), LEASE_TTL);
    }

    async acquire(pane: PaneId, waitMs: Milliseconds = LEASE_WAIT_MS): Promise<Acquired> {
        const until = this.deps.now() + waitMs;
        let got = await this.take(pane);
        while (got === 'busy' && this.deps.now() < until) {
            await this.deps.pause(RETRY_MS);
            got = await this.take(pane);
        }
        if (got === 'unavailable' && !this.outage) {
            this.outage = true;
            this.deps.log(must(parseText('typing lease: herdr cannot take or read it; typing without it until it can')));
        }
        return got;
    }
}
