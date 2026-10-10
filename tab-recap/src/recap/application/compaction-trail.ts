import type { ActiveStage, CompactionEnd, CompactionRecords, StageFacts } from '#src/ports/compaction-records.ts';

export type Records = Pick<CompactionRecords, 'begin' | 'advance' | 'finish'>;

export class Trail {
    readonly id: string;
    private readonly records: Records;
    private readonly now: () => number;
    private readonly observe: ((end: CompactionEnd) => void) | undefined;

    constructor(records: Records, id: string, now: () => number, observe?: (end: CompactionEnd) => void) {
        this.records = records;
        this.id = id;
        this.now = now;
        this.observe = observe;
    }

    to(stage: ActiveStage, facts: Omit<StageFacts, 'at'> = {}): void {
        this.records.advance(this.id, stage, { at: this.now(), ...facts });
    }

    end(stage: CompactionEnd['stage'], facts: Omit<CompactionEnd, 'stage' | 'at'> = {}): void {
        const end: CompactionEnd = { stage, at: this.now(), ...facts };
        this.records.finish(this.id, end);
        this.observe?.(end);
    }
}
