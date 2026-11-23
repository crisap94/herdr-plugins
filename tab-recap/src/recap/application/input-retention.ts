import type { Clock } from '#src/ports/clock.ts';
import type { RunInputReader } from '#src/ports/run-inputs.ts';
import type { DecisionBriefs } from '#src/ports/autocompact-briefs.ts';
import type { BriefRetention } from '#src/recap/domain/autocompact.ts';
import { countOf, type Count } from '#src/recap/domain/count.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { textOf, type Text } from '#src/recap/domain/text.ts';

const DAY_MS = 86_400_000;

interface RetentionParts {
    readonly inputs: RunInputReader;
    readonly briefs: DecisionBriefs;
    readonly clock: Clock;
    readonly days: () => Count;
    readonly briefRetention: () => BriefRetention;
    readonly log: (line: Text) => void;
}

export class InputRetention {
    private readonly inputs: RunInputReader;
    private readonly briefs: DecisionBriefs;
    private readonly clock: Clock;
    private readonly days: () => Count;
    private readonly briefRetention: () => BriefRetention;
    private readonly log: (line: Text) => void;
    private last: Instant | null = null;

    constructor(parts: RetentionParts) {
        this.inputs = parts.inputs;
        this.briefs = parts.briefs;
        this.clock = parts.clock;
        this.days = parts.days;
        this.briefRetention = parts.briefRetention;
        this.log = parts.log;
    }

    tick(): Count {
        const now = this.clock.now();
        if (this.last !== null && now - this.last < DAY_MS) {
            return countOf(0);
        }
        this.last = now;
        const retention = this.briefRetention();
        const cutoff = retention.kind === 'none' ? Number.MAX_SAFE_INTEGER : now - retention.value * DAY_MS;
        try {
            this.briefs.clearBefore(instant(cutoff));
        } catch (error) {
            this.log(textOf(`could not delete old autocompact briefs: ${error instanceof Error ? error.message : String(error)}`));
        }
        let gone = countOf(0);
        try {
            gone = this.inputs.prune(instant(now - this.days() * DAY_MS));
        } catch (error) {
            this.log(textOf(`could not delete old run inputs: ${error instanceof Error ? error.message : String(error)}`));
        }
        if (gone > 0) {
            this.log(textOf(`deleted ${gone} stored run input${gone === 1 ? '' : 's'} older than ${this.days()} days`));
        }
        return gone;
    }
}
