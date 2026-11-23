import type { ActiveStage, CompactionFinish, CompactionLog, StageNote } from '#src/ports/compaction-records.ts';
import type { CompactFailure } from '#src/protocol/exchanges/compact.ts';
import type { CompactionId } from '#src/recap/domain/ids.ts';
import type { Instant } from '#src/recap/domain/time.ts';

export type Records = Pick<CompactionLog, 'begin' | 'advance' | 'finish'>;

export type EndObserver = (end: CompactionFinish, reason: CompactFailure | null) => void;

export class Trail {
    readonly id: CompactionId;
    private readonly records: Records;
    private readonly now: () => Instant;
    private readonly observe: EndObserver | undefined;

    constructor(records: Records, id: CompactionId, now: () => Instant, observe?: EndObserver) {
        this.records = records;
        this.id = id;
        this.now = now;
        this.observe = observe;
    }

    to(stage: ActiveStage, facts: Omit<StageNote, 'at'> = {}): void {
        this.records.advance(this.id, stage, { at: this.now(), ...facts });
    }

    end(stage: CompactionFinish['stage'], facts: Omit<CompactionFinish, 'stage' | 'at'> = {}, reason: CompactFailure | null = null): void {
        const end: CompactionFinish = { stage, at: this.now(), ...facts };
        this.records.finish(this.id, end);
        this.observe?.(end, reason);
    }
}
