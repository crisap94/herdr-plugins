// The autocompact sweep: on the first resync tick after the start and every five after it, every idle or done lane of the board is considered,
// one at a time, through the same gates as a settled lane. A sweep still running when the next is due is skipped, never stacked.
import type { Board } from '#src/recap/domain/board.ts';
import { READY } from '#src/recap/domain/autocompact.ts';
import type { Lane } from '#src/recap/domain/lane.ts';

/** every this many resync ticks (five minutes at the one-minute tick) */
export const SWEEP_EVERY = 5;

/** What a sweep needs of autocompact: a prune of the skips, and one consideration, which never throws. */
export interface Considers {
    prune(board: readonly Lane[]): void;
    consider(lane: Lane): Promise<void>;
}

export interface SweepParts {
    board(): Board;
    autocompact(): Considers | null;
    log(line: string): void;
}

export class AutocompactSweep {
    private readonly parts: SweepParts;
    private ticks = 0;
    private running = false;

    constructor(parts: SweepParts) {
        this.parts = parts;
    }

    /** Called on every resync tick: starts a sweep when one is due and none is running. */
    tick(): void {
        const due = this.ticks % SWEEP_EVERY === 0;
        this.ticks += 1;
        if (!due || this.running) return;
        this.running = true;
        this.sweep()
            .catch((error: unknown) => { this.parts.log(`autocompact sweep: ${error instanceof Error ? error.message : String(error)}`); })
            .finally(() => { this.running = false; });
    }

    /** The skips of lanes that are no longer idle or done are forgotten first; then each lane of the board that was there at the start is re-read from the
     * board and considered, one at a time, unless it is gone or no longer idle or done by then. */
    async sweep(): Promise<void> {
        const autocompact = this.parts.autocompact();
        if (autocompact === null) return;
        const snapshot = this.parts.board();
        autocompact.prune([...snapshot.lanes.values()]);
        for (const pane of snapshot.lanes.keys()) {
            const lane = this.parts.board().lanes.get(pane);
            if (lane !== undefined && READY.has(lane.status)) await autocompact.consider(lane);
        }
    }
}
