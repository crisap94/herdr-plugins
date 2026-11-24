import type { Curated, CuratorMode, Curators } from '@stateforge-labs/session-ledger';
import type { HarnessAsk, HarnessChoice, HarnessPort } from '#src/ports/harness.ts';
import { isUnknown, unknown } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { causeOf } from '@stateforge-labs/session-ledger';
import type { JobAnswer } from '#src/recap/domain/job.ts';
import { parseText, textOf, type Text } from '@stateforge-labs/session-ledger';
import { CURATOR_INSTRUCTIONS } from './prompts/curator-instructions.ts';
import { RECONCILE_CURATOR_INSTRUCTIONS } from './prompts/curator-reconcile-instructions.ts';
import { unfencedText } from './prompts/recap-prompt.ts';

export class HarnessCurator implements Curators {
    readonly backend: Text;
    private readonly harness: HarnessPort;
    private readonly settings: HarnessChoice;
    private readonly answer: JobAnswer;

    constructor(harness: HarnessPort, settings: HarnessChoice, answer: JobAnswer = 'text') {
        this.harness = harness;
        this.settings = settings;
        this.answer = answer;
        this.backend = harness.label(settings);
    }

    async write(document: Text, mode: CuratorMode = 'story'): Promise<Curated> {
        const instructions = textOf(mode === 'reconcile' ? RECONCILE_CURATOR_INSTRUCTIONS : CURATOR_INSTRUCTIONS);
        const schema = this.answer === 'schema' && this.harness.structured === 'schema';
        const call: HarnessAsk = schema ? { instructions, input: document, answer: { kind: 'schema', schema: mode } } : { instructions, input: document };
        if (this.harness.limit !== null && Buffer.byteLength(document) + Buffer.byteLength(instructions) > this.harness.limit) {
            return unknown({ why: 'unreadable', detail: causeOf(must(parseText(`the document is too long for ${this.harness.id}`))) });
        }
        const ran = await this.harness.run(call, this.settings);
        return isUnknown(ran) ? ran : { kind: 'curated', text: unfencedText(ran.text) };
    }
}
