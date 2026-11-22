import type { BackendHarness, HarnessAsk, HarnessChoice } from '#src/ports/harness.ts';
import type { RecapRequest, Summarizer, Written } from '#src/ports/summarizer.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { textOf, type Text } from '#src/recap/domain/text.ts';
import type { JobAnswer } from '#src/recap/domain/job.ts';
import { TRANSCRIPT_BUDGET, writerContext } from '#src/recap/application/writer-context.ts';
import { instructions } from './prompts/recap-instructions.ts';
import { fittedAsk, unfencedText } from './prompts/recap-prompt.ts';
import { jobContractOf } from '#src/recap/domain/backend.ts';
import type { JobContract } from '#src/recap/domain/backend.ts';

export class RecapWriter implements Summarizer {
    readonly backend: Text;
    readonly contract: JobContract;
    private readonly harness: BackendHarness;
    private readonly settings: HarnessChoice;
    private readonly answer: JobAnswer;

    constructor(harness: BackendHarness, settings: HarnessChoice, answer: JobAnswer = 'text') {
        this.harness = harness;
        this.settings = settings;
        this.answer = answer;
        this.backend = harness.label(settings);
        this.contract = jobContractOf(harness.id);
    }

    async write(request: RecapRequest): Promise<Written> {
        const asked: HarnessAsk = this.harness.limit === null ? { instructions: textOf(instructions(request)), input: textOf(writerContext(request, TRANSCRIPT_BUDGET)) } : fittedAsk(request, this.harness.limit);
        const call: HarnessAsk = this.answer === 'schema' && this.harness.structured === 'schema' ? { ...asked, answer: { kind: 'schema', schema: 'writer' } } : asked;
        const ran = await this.harness.run(call, this.settings);
        return isUnknown(ran) ? ran : { kind: 'written', text: unfencedText(ran.text), costUsd: ran.costUsd };
    }
}
