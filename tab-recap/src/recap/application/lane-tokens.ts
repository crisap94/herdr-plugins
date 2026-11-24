import type { Board } from '#src/recap/domain/board.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { CAPABILITY_VALUE, OWNED_TOKENS, STATE_TOKENS, clearing, tokenValuesOf, writeDueOf } from '#src/recap/domain/lane-tokens.ts';
import { NEEDS_TOKEN } from '#src/recap/domain/lane-token-names.ts';
import type { LaneTokenFacts, LaneWrite, TokenMap } from '#src/recap/domain/lane-tokens.ts';
import { uncheckedTokenName, type SessionKey } from '#src/recap/domain/ids.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import { textOf, type Text } from '@stateforge-labs/session-ledger';
import { instant, parseMilliseconds, type Instant } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { backoffMs } from '#src/recap/domain/backoff.ts';
import { countOf, type Count } from '@stateforge-labs/session-ledger';
import type { LaneTokenMap, LaneTokenReporter } from '#src/ports/lane-tokens.ts';
import type { TokenName, TokenValue } from '#src/protocol/primitives.ts';
import { isUnknown, saying } from '@stateforge-labs/session-ledger';
import type { LaneEvents } from './lane-events.ts';

export const TICK_MS = 2_000;
export const TTL_MS = 120_000;

const TTL = must(parseMilliseconds(TTL_MS));
const NEEDS = uncheckedTokenName(NEEDS_TOKEN);
const STATE_NAMES: readonly TokenName[] = STATE_TOKENS.map(uncheckedTokenName);
const OWNED_NAMES: readonly TokenName[] = OWNED_TOKENS.map(uncheckedTokenName);

export interface LaneTokenDeps {
    readonly tokens: LaneTokenReporter;
    readonly enabled: () => Presence;
    readonly board: () => Board;
    readonly facts: (lane: Lane) => LaneTokenFacts;
    readonly capability?: () => TokenValue;
    readonly now: () => Instant;
    readonly log: (line: Text) => void;
    readonly events?: LaneEvents;
}

interface Failing {
    readonly count: Count;
    readonly until: Instant;
}

export class LaneTokenPublisher {
    private readonly deps: LaneTokenDeps;
    private readonly written = new Map<SessionKey, LaneWrite>();
    private readonly failing = new Map<SessionKey, Failing>();
    private lastTick: Instant = instant(Number.NEGATIVE_INFINITY);

    constructor(deps: LaneTokenDeps) {
        this.deps = deps;
    }

    tick(): void {
        const now = this.deps.now();
        if (now - this.lastTick < TICK_MS) {
            return;
        }
        this.lastTick = now;
        const lanes = this.deps.enabled() === 'present' ? [...this.deps.board().lanes.values()] : [];
        const live = new Set(lanes.map((lane) => lane.pane));
        for (const pane of this.written.keys()) {
            if (!live.has(pane)) {
                this.clear(pane);
            }
        }
        for (const lane of lanes) {
            this.publish(lane, now);
        }
    }

    private publish(lane: Lane, now: Instant): void {
        const pane = lane.pane;
        if ((this.failing.get(pane)?.until ?? 0) > now) {
            return;
        }
        const previous = this.written.get(pane);
        const values = tokenValuesOf(this.deps.facts(lane), this.deps.capability?.() ?? CAPABILITY_VALUE);
        const due = writeDueOf(previous ?? null, values, now, TTL);
        if (due === null) {
            return;
        }
        this.announceNeeds(lane, previous?.values, due);
        this.written.set(pane, { values: due, at: now });
        void this.send(pane, new Map([...due, ...clearing(STATE_NAMES.filter((name) => !due.has(name)))]), now);
    }

    private announceNeeds(lane: Lane, was: TokenMap | undefined, now: TokenMap): void {
        const before = was?.get(NEEDS);
        const count = now.get(NEEDS);
        if (before !== undefined && count !== undefined && before !== count) {
            this.deps.events?.lane(lane.pane, Number(count) > Number(before) ? 'needs-raised' : 'needs-cleared', textOf(count));
        }
    }

    private clear(pane: SessionKey): void {
        this.written.delete(pane);
        void this.send(pane, clearing(OWNED_NAMES), this.deps.now());
    }

    private async send(pane: SessionKey, tokens: LaneTokenMap, now: Instant): Promise<void> {
        const done = await this.deps.tokens.report(pane, tokens, TTL);
        if (isUnknown(done)) {
            this.written.delete(pane);
            this.fail(pane, now, saying(done.why));
        } else {
            this.failing.delete(pane);
        }
    }

    private fail(pane: SessionKey, now: Instant, why: Text): void {
        const count = countOf((this.failing.get(pane)?.count ?? 0) + 1);
        const wait = backoffMs(count);
        this.failing.set(pane, { count, until: instant(now + wait) });
        if (count === 1) {
            this.deps.log(textOf(`lane tokens on ${pane}: not written (${why}); trying again with a back-off`));
        }
    }
}
