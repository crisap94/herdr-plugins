import type { Candidate } from '@stateforge-labs/session-ledger/compaction-timing';
import { must } from '#src/protocol/result.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';

export const SWEEP_EVERY = 5;

export interface Considers {
    prune(candidates: readonly Candidate[]): void;
    consider(candidate: Candidate): Promise<void>;
}

type SweepRun = 'idle' | 'running';

export interface SweepParts {
    candidates(): readonly Candidate[];
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
        void this.run();
    }

    private async run(): Promise<void> {
        try {
            await this.sweep();
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            this.parts.log(must(parseText(`autocompact sweep: ${detail}`)));
        } finally {
            this.running = 'idle';
        }
    }

    async sweep(): Promise<void> {
        const autocompact = this.parts.autocompact();
        if (autocompact === null) return;
        const snapshot = this.parts.candidates();
        autocompact.prune(snapshot);
        for (const { key } of snapshot) {
            const fresh = this.parts.candidates().find((found) => found.key === key);
            if (fresh !== undefined && fresh.ready) await autocompact.consider(fresh);
        }
    }
}
