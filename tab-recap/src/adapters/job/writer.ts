import type { Harness, HarnessCall, HarnessSettings } from '#src/ports/harness.ts';
import type { BackendId } from '#src/recap/domain/backend.ts';
import type { RecapRequest, Summarizer, Written } from '#src/ports/summarizer.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { parseUsd } from '#src/recap/domain/usd.ts';
import { must } from '#src/protocol/result.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import type { JobAnswer } from '#src/recap/domain/job.ts';
import { TRANSCRIPT_BUDGET, writerContext } from '#src/recap/application/writer-context.ts';
import { instructions } from './prompts/recap-instructions.ts';
import { fittedCall, unfencedText } from './prompts/recap-prompt.ts';
import { jobContractOf } from '#src/recap/domain/backend.ts';
import type { JobContract } from '#src/recap/domain/backend.ts';

export class RecapWriter implements Summarizer {
    readonly backend: Text;
    readonly contract: JobContract;
    private readonly harness: Harness<BackendId>;
    private readonly settings: HarnessSettings;
    private readonly answer: JobAnswer;

    constructor(harness: Harness<BackendId>, settings: HarnessSettings, answer: JobAnswer = 'text') {
        this.harness = harness;
        this.settings = settings;
        this.answer = answer;
        this.backend = must(parseText(harness.label(settings)));
        this.contract = jobContractOf(harness.id);
    }

    async write(request: RecapRequest): Promise<Written> {
        const asked: HarnessCall = this.harness.limit === null ? { instructions: instructions(request), input: writerContext(request, TRANSCRIPT_BUDGET) } : fittedCall(request, this.harness.limit);
        const call: HarnessCall = this.answer === 'schema' && this.harness.structured === 'schema' ? { ...asked, answer: { kind: 'schema', schema: 'writer' } } : asked;
        const ran = await this.harness.run(call, this.settings);
        return isUnknown(ran) ? ran : { kind: 'written', text: unfencedText(must(parseText(ran.text))), costUsd: must(parseUsd(ran.costUsd)) };
    }
}
