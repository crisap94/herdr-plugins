import type { ActiveStage, CompactionEnd, CompactionRecords, StageFacts } from '#src/ports/compaction-records.ts';
import type { CompactFailure } from '#src/protocol/exchanges/compact.ts';
import type { Instant } from '#src/recap/domain/time.ts';

export type Records = Pick<CompactionRecords, 'begin' | 'advance' | 'finish'>;

export type EndObserver = (end: CompactionEnd, reason: CompactFailure | null) => void;

export class Trail {
    readonly id: string;
    private readonly records: Records;
    private readonly now: () => Instant;
    private readonly observe: EndObserver | undefined;

    constructor(records: Records, id: string, now: () => Instant, observe?: EndObserver) {
        this.records = records;
        this.id = id;
        this.now = now;
        this.observe = observe;
    }

    to(stage: ActiveStage, facts: Omit<StageFacts, 'at'> = {}): void {
        this.records.advance(this.id, stage, { at: this.now(), ...facts });
    }

    end(stage: CompactionEnd['stage'], facts: Omit<CompactionEnd, 'stage' | 'at'> = {}, reason: CompactFailure | null = null): void {
        const end: CompactionEnd = { stage, at: this.now(), ...facts };
        this.records.finish(this.id, end);
        this.observe?.(end, reason);
    }
}
