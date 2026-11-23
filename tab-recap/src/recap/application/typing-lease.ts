import { createTypingLease, type Acquired, type LeaseEvent, type PaneTokenStore, type TypingLease } from '@stateforge-labs/herdr-sdk/typing';
import { err, ok, must as mustOwner, owner } from '@stateforge-labs/herdr-sdk/pane-tokens';
import type { LaneTokenReporter } from '#src/ports/lane-tokens.ts';
import type { PaneTokens } from '#src/ports/pane-tokens.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { uncheckedMilliseconds, uncheckedTokenName, uncheckedTokenValue, uncheckedPaneId, type PaneId } from '#src/recap/domain/ids.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { duration, parseMilliseconds, type Duration, type Instant, type Milliseconds } from '#src/recap/domain/time.ts';
import { LEASE_TTL_MS } from '#src/recap/domain/typing-lease.ts';

const TOOL = 'tab-recap';
export const RETRY_MS = must(parseMilliseconds(1000));
const LEASE_WAIT_MS = must(parseMilliseconds(LEASE_TTL_MS));
const OUTAGE_LINE = must(parseText('typing lease: herdr cannot take or read it; typing without it until it can'));

export type { Acquired };

export interface PaneTypingLeaseDeps {
    readonly tokens: LaneTokenReporter;
    readonly panes: PaneTokens;
    readonly now: () => Instant;
    readonly pause: (span: Duration) => Promise<void>;
    readonly log: (line: Text) => void;
}

const unreachable = { why: 'unreachable', detail: 'herdr cannot take or read it' } as const;

export class PaneTypingLease {
    private readonly lease: TypingLease;

    constructor(deps: PaneTypingLeaseDeps) {
        const store: PaneTokenStore = {
            read: async (pane) => {
                const read = await deps.panes.read(uncheckedPaneId(pane));
                return isUnknown(read) ? err(unreachable) : ok(Object.fromEntries(read.tokens));
            },
            report: async (pane, tokens, ttlMs) => {
                const values = new Map(Object.entries(tokens).map(([name, value]) => [uncheckedTokenName(name), value === null ? null : uncheckedTokenValue(value)] as const));
                const wrote = await deps.tokens.report(uncheckedPaneId(pane), values, uncheckedMilliseconds(ttlMs));
                return isUnknown(wrote) ? err(unreachable) : ok(undefined);
            },
        };
        this.lease = createTypingLease({
            owner: mustOwner(owner(TOOL)),
            tokens: store,
            clock: { now: () => deps.now(), pause: (ms) => deps.pause(duration(uncheckedMilliseconds(ms))) },
            onEvent: (event: LeaseEvent): void => {
                if (event.kind === 'LeaseUnavailable') {
                    deps.log(OUTAGE_LINE);
                }
            },
        });
    }

    release(pane: PaneId): Promise<void> {
        return this.lease.release(pane);
    }

    acquire(pane: PaneId, waitMs: Milliseconds = LEASE_WAIT_MS): Promise<Acquired> {
        return this.lease.acquire(pane, Number(waitMs));
    }
}
