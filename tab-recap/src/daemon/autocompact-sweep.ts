import type { Board } from '#src/recap/domain/board.ts';
import { READY } from '#src/recap/domain/autocompact.ts';
import type { Lane } from '#src/recap/domain/lane.ts';

export const SWEEP_EVERY = 5;

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

    tick(): void {
        const due = this.ticks % SWEEP_EVERY === 0;
        this.ticks += 1;
        if (!due || this.running) return;
        this.running = true;
        this.sweep()
            .catch((error: unknown) => { this.parts.log(`autocompact sweep: ${error instanceof Error ? error.message : String(error)}`); })
            .finally(() => { this.running = false; });
    }

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
