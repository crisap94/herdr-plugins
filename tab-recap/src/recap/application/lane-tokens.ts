// Publishes the lane tokens on each lane's pane while herdr events are on: when a value changes, or half the time to live has passed.
// A lane that leaves the board, or the setting turning off, has the names tab-recap owns cleared. Runs at most every TICK_MS.
import type { Board } from '#src/recap/domain/board.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { NEEDS_TOKEN, OWNED_TOKENS, clearing, valuesOf, writeDue } from '#src/recap/domain/lane-tokens.ts';
import type { LaneFacts, Written } from '#src/recap/domain/lane-tokens.ts';
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import type { LaneEvents } from './lane-events.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';

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
    /** the lane's events: needs raised or cleared, and the lane closed */
    readonly events?: LaneEvents;
}

export class LaneTokenPublisher {
    private readonly deps: LaneTokenDeps;
    /** pane → what was last written there (set when the write is sent; dropped again if it fails, so the next tick retries) */
    private readonly written = new Map<string, Written>();
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
        for (const pane of this.written.keys()) {
            if (!live.has(pane)) {
                this.deps.events?.lane(pane, 'lane-closed');
                this.clear(pane);
            }
        }
        for (const lane of lanes) {
            this.publish(lane, now);
        }
    }

    private publish(lane: Lane, now: number): void {
        const pane = String(lane.pane);
        const values = valuesOf(this.deps.facts(lane));
        const due = writeDue(this.written.get(pane) ?? null, values, now, TTL_MS);
        if (due === null) {
            return;
        }
        const needs = this.written.get(pane)?.values[NEEDS_TOKEN];
        const count = values[NEEDS_TOKEN];
        if (needs !== undefined && count !== undefined && needs !== count) {
            this.deps.events?.lane(pane, Number(count) > Number(needs) ? 'needs-raised' : 'needs-cleared', count);
        }
        this.written.set(pane, { values: due, at: now });
        void this.send(pane, due, () => { this.written.delete(pane); });
    }

    private clear(pane: string): void {
        this.written.delete(pane);
        void this.send(pane, clearing(OWNED_TOKENS), () => undefined);
    }

    private async send(pane: string, tokens: Readonly<Record<string, string | null>>, failed: () => void): Promise<void> {
        const done = await this.deps.tokens.report(pane, tokens, TTL_MS);
        if (isUnknown(done)) {
            failed();
            this.deps.log(`lane tokens on ${pane}: not written (${saying(done.why)})`);
        }
    }
}
