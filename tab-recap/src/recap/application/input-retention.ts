// How long a run's input document is kept: once a day the daemon deletes the older ones. The runs stay.
import type { Clock } from '#src/ports/clock.ts';
import type { RunInputs } from '#src/ports/run-inputs.ts';

const DAY_MS = 86_400_000;

export class InputRetention {
    private readonly inputs: RunInputs;
    private readonly clock: Clock;
    private readonly days: () => number;
    private readonly log: (line: string) => void;
    private last: number | null = null;

    constructor(parts: { readonly inputs: RunInputs; readonly clock: Clock; readonly days: () => number; readonly log: (line: string) => void }) {
        this.inputs = parts.inputs;
        this.clock = parts.clock;
        this.days = parts.days;
        this.log = parts.log;
    }

    /** Called on every tick; does its work at most once a day. Returns how many inputs it deleted; 0 days keeps none (every input is older than now). */
    tick(): number {
        const now = Number(this.clock.now());
        if (this.last !== null && now - this.last < DAY_MS) {
            return 0;
        }
        this.last = now;
        let gone = 0;
        try {
            gone = this.inputs.prune(now - this.days() * DAY_MS);
        } catch (error) {
            this.log(`could not delete old run inputs: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (gone > 0) {
            this.log(`deleted ${gone} stored run input${gone === 1 ? '' : 's'} older than ${this.days()} days`);
        }
        return gone;
    }
}
