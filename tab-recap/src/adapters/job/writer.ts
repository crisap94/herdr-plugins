import type { BackendHarness, HarnessAsk, HarnessChoice } from '#src/ports/harness.ts';
import type { RecapRequest, Written } from '@stateforge-labs/session-ledger';
import type { LegacyWriter as Writer } from '@stateforge-labs/session-ledger';
import { isUnknown } from '@stateforge-labs/session-ledger';
import { textOf, type Text } from '@stateforge-labs/session-ledger';
import type { JobAnswer } from '#src/recap/domain/job.ts';
import { TRANSCRIPT_BUDGET, writerContext } from '@stateforge-labs/session-ledger';
import { instructions } from './prompts/recap-instructions.ts';
import { fittedAsk, unfencedText } from './prompts/recap-prompt.ts';
import { jobContractOf } from '@stateforge-labs/session-ledger';
import type { JobContract } from '@stateforge-labs/session-ledger';

export class RecapWriter implements Writer {
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
        const asked: HarnessAsk = this.harness.limit === null ? { instructions: instructions(request), input: textOf(writerContext(request, TRANSCRIPT_BUDGET)) } : fittedAsk(request, this.harness.limit);
        const call: HarnessAsk = this.answer === 'schema' && this.harness.structured === 'schema' ? { ...asked, answer: { kind: 'schema', schema: 'writer' } } : asked;
        const ran = await this.harness.run(call, this.settings);
        return isUnknown(ran) ? ran : { kind: 'written', text: unfencedText(ran.text), costUsd: ran.costUsd };
    }
}
