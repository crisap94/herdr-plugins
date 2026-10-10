import type { Clock } from '#src/ports/clock.ts';
import type { RunInputs } from '#src/ports/run-inputs.ts';
import type { AutocompactBriefs } from '#src/ports/autocompact-briefs.ts';
import type { BriefRetention } from '#src/recap/domain/autocompact.ts';

const DAY_MS = 86_400_000;

export class InputRetention {
    private readonly inputs: RunInputs;
    private readonly briefs: AutocompactBriefs;
    private readonly clock: Clock;
    private readonly days: () => number;
    private readonly briefRetention: () => BriefRetention;
    private readonly log: (line: string) => void;
    private last: number | null = null;

    constructor(parts: { readonly inputs: RunInputs; readonly briefs: AutocompactBriefs; readonly clock: Clock; readonly days: () => number; readonly briefRetention: () => BriefRetention; readonly log: (line: string) => void }) {
        this.inputs = parts.inputs;
        this.briefs = parts.briefs;
        this.clock = parts.clock;
        this.days = parts.days;
        this.briefRetention = parts.briefRetention;
        this.log = parts.log;
    }

    tick(): number {
        const now = Number(this.clock.now());
        if (this.last !== null && now - this.last < DAY_MS) {
            return 0;
        }
        this.last = now;
        const retention = this.briefRetention();
        const cutoff = retention.kind === 'none' ? Number.MAX_SAFE_INTEGER : now - retention.value * DAY_MS;
        try {
            this.briefs.clearBefore(cutoff);
        } catch (error) {
            this.log(`could not delete old autocompact briefs: ${error instanceof Error ? error.message : String(error)}`);
        }
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
