import type { Harness, HarnessSettings } from '#src/ports/harness.ts';
import type { RecapRequest, Summarizer, Written } from '#src/ports/summarizer.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { TRANSCRIPT_BUDGET, writerContext } from '#src/recap/application/writer-context.ts';
import { instructions } from './recap-instructions.ts';
import { fittedCall, unfenced } from './recap-prompt.ts';
import { jobContractOf } from '#src/recap/domain/backend.ts';
import type { JobContract } from '#src/recap/domain/backend.ts';

export class RecapWriter implements Summarizer {
    readonly backend: string;
    readonly contract: JobContract;
    private readonly harness: Harness;
    private readonly settings: HarnessSettings;

    constructor(harness: Harness, settings: HarnessSettings) {
        this.harness = harness;
        this.settings = settings;
        this.backend = harness.label(settings);
        this.contract = jobContractOf(harness.id);
    }

    async write(request: RecapRequest): Promise<Written> {
        const call = this.harness.limit === null ? { instructions: instructions(request), input: writerContext(request, TRANSCRIPT_BUDGET) } : fittedCall(request, this.harness.limit);
        const ran = await this.harness.run(call, this.settings);
        return isUnknown(ran) ? ran : { kind: 'written', text: unfenced(ran.text), costUsd: ran.costUsd };
    }
}
