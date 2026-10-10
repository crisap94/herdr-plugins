// One compaction's record, written stage by stage by the flow that runs it.
import type { ActiveStage, CompactionEnd, CompactionRecords, StageFacts } from '#src/ports/compaction-records.ts';

export type Records = Pick<CompactionRecords, 'begin' | 'advance' | 'finish'>;

/** The record of one lane's compaction, with the clock the daemon reads. */
export class Trail {
    readonly id: string;
    private readonly records: Records;
    private readonly now: () => number;
    private readonly observe: ((end: CompactionEnd) => void) | undefined;

    /** `observe` hears how the compaction ended (a request from another tool is answered with it) */
    constructor(records: Records, id: string, now: () => number, observe?: (end: CompactionEnd) => void) {
        this.records = records;
        this.id = id;
        this.now = now;
        this.observe = observe;
    }

    /** The compaction is in `stage` from now on. */
    to(stage: ActiveStage, facts: Omit<StageFacts, 'at'> = {}): void {
        this.records.advance(this.id, stage, { at: this.now(), ...facts });
    }

    /** The compaction ended, with what is known of how. */
    end(stage: CompactionEnd['stage'], facts: Omit<CompactionEnd, 'stage' | 'at'> = {}): void {
        const end: CompactionEnd = { stage, at: this.now(), ...facts };
        this.records.finish(this.id, end);
        this.observe?.(end);
    }
}
