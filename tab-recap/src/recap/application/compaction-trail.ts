// One compaction's record, written stage by stage by the flow that runs it.
import type { ActiveStage, CompactionEnd, CompactionRecords, StageFacts } from '#src/ports/compaction-records.ts';

export type Records = Pick<CompactionRecords, 'begin' | 'advance' | 'finish'>;

/** The record of one lane's compaction, with the clock the daemon reads. */
export class Trail {
    readonly id: string;
    private readonly records: Records;
    private readonly now: () => number;

    constructor(records: Records, id: string, now: () => number) {
        this.records = records;
        this.id = id;
        this.now = now;
    }

    /** The compaction is in `stage` from now on. */
    to(stage: ActiveStage, facts: Omit<StageFacts, 'at'> = {}): void {
        this.records.advance(this.id, stage, { at: this.now(), ...facts });
    }

    /** The compaction ended, with what is known of how. */
    end(stage: CompactionEnd['stage'], facts: Omit<CompactionEnd, 'stage' | 'at'> = {}): void {
        this.records.finish(this.id, { stage, at: this.now(), ...facts });
    }
}
