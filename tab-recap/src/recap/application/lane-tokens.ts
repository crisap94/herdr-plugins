// Publishes the lane tokens on each lane's pane while herdr events are on: when a value changes, or half the time to live has passed. A fact that
// became unknown is written as `null`. A lane that leaves the board is closed on its workspace, and has its names cleared. A pane whose writes fail
// waits (doubling, up to a minute) and is logged once per outage. Runs at most every TICK_MS.
import type { Board } from '#src/recap/domain/board.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { OWNED_TOKENS, STATE_TOKENS, NEEDS_TOKEN, clearing, valuesOf, writeDue } from '#src/recap/domain/lane-tokens.ts';
import type { LaneFacts, TokenValues } from '#src/recap/domain/lane-tokens.ts';
import { backoffMs } from '#src/recap/domain/backoff.ts';
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import type { LaneEvents } from './lane-events.ts';

export const TICK_MS = 2_000;
/** a token lives twice the resync interval (a minute): it expires on its own if the daemon stops */
export const TTL_MS = 120_000;

export interface LaneTokenDeps {
    readonly tokens: LaneTokens;
    readonly enabled: () => boolean;
    readonly board: () => Board;
    readonly facts: (lane: Lane) => LaneFacts;
    readonly now: () => number;
    readonly log: (line: string) => void;
    readonly events?: LaneEvents;
}

/** what was last written on a pane, when, and on which workspace (where its `lane-closed` goes) */
interface Held {
    readonly values: TokenValues;
    readonly at: number;
    readonly workspace: string;
}

export class LaneTokenPublisher {
    private readonly deps: LaneTokenDeps;
    /** pane → what was last written there (set when the write is sent; dropped again if it fails, so a later tick retries) */
    private readonly written = new Map<string, Held>();
    /** pane → consecutive failures and the time before which nothing is written there */
    private readonly failing = new Map<string, { readonly count: number; readonly until: number }>();
    private lastTick = Number.NEGATIVE_INFINITY;

    constructor(deps: LaneTokenDeps) {
        this.deps = deps;
    }

    tick(): void {
        const now = this.deps.now();
        if (now - this.lastTick < TICK_MS) {
            return;
        }
        this.lastTick = now;
        const lanes = this.deps.enabled() ? [...this.deps.board().lanes.values()] : [];
        const live = new Set(lanes.map((lane) => String(lane.pane)));
        for (const [pane, held] of this.written) {
            if (!live.has(pane)) {
                this.deps.events?.inWorkspace(held.workspace, 'lane-closed', pane);
                this.clear(pane);
            }
        }
        for (const lane of lanes) {
            this.publish(lane, now);
        }
    }

    private publish(lane: Lane, now: number): void {
        const pane = String(lane.pane);
        if ((this.failing.get(pane)?.until ?? 0) > now) {
            return;
        }
        const previous = this.written.get(pane);
        const values = valuesOf(this.deps.facts(lane));
        const due = writeDue(previous === undefined ? null : { values: previous.values, at: previous.at }, values, now, TTL_MS);
        if (due === null) {
            return;
        }
        this.announceNeeds(lane, previous?.values, due);
        this.written.set(pane, { values: due, at: now, workspace: String(lane.workspace) });
        void this.send(pane, { ...due, ...clearing(STATE_TOKENS.filter((name) => !(name in due))) }, now);
    }

    /** A change of the open needs is an event: raised when it grows, cleared when it shrinks. */
    private announceNeeds(lane: Lane, was: TokenValues | undefined, now: TokenValues): void {
        const before = was?.[NEEDS_TOKEN];
        const count = now[NEEDS_TOKEN];
        if (before !== undefined && count !== undefined && before !== count) {
            this.deps.events?.lane(String(lane.pane), Number(count) > Number(before) ? 'needs-raised' : 'needs-cleared', count);
        }
    }

    private clear(pane: string): void {
        this.written.delete(pane);
        void this.send(pane, clearing(OWNED_TOKENS), this.deps.now());
    }

    private async send(pane: string, tokens: Readonly<Record<string, string | null>>, now: number): Promise<void> {
        const done = await this.deps.tokens.report(pane, tokens, TTL_MS);
        if (isUnknown(done)) {
            this.written.delete(pane);
            this.fail(pane, now, saying(done.why));
        } else {
            this.failing.delete(pane);
        }
    }

    private fail(pane: string, now: number, why: string): void {
        const count = (this.failing.get(pane)?.count ?? 0) + 1;
        const wait = backoffMs(count);
        this.failing.set(pane, { count, until: now + wait });
        if (count === 1) {
            this.deps.log(`lane tokens on ${pane}: not written (${why}); trying again with a back-off`);
        }
    }
}
