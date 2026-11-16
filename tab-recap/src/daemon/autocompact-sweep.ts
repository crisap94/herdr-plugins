import type { Board } from '#src/recap/domain/board.ts';
import { READY } from '#src/recap/domain/status.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { must } from '#src/protocol/result.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';

export const SWEEP_EVERY = 5;

export interface Considers {
    prune(board: readonly Lane[]): void;
    consider(lane: Lane): Promise<void>;
}

type SweepRun = 'idle' | 'running';

export interface SweepParts {
    board(): Board;
    autocompact(): Considers | null;
    log(line: Text): void;
}

export class AutocompactSweep {
    private readonly parts: SweepParts;
    private ticks: Count = must(parseCount(0));
    private running: SweepRun = 'idle';

    constructor(parts: SweepParts) {
        this.parts = parts;
    }

    tick(): void {
        const due = this.ticks % SWEEP_EVERY === 0;
        this.ticks = must(parseCount(this.ticks + 1));
        if (!due || this.running === 'running') return;
        this.running = 'running';
        this.sweep()
            .catch((error: unknown) => { this.parts.log(must(parseText(`autocompact sweep: ${error instanceof Error ? error.message : String(error)}`))); })
            .finally(() => { this.running = 'idle'; });
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
