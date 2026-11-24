import type { BriefWriter, BriefWritten } from '#src/ports/compaction-briefs.ts';
import type { HarnessAsk, HarnessChoice, HarnessPort } from '#src/ports/harness.ts';
import { isUnknown, unknown } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { BRIEF_INSTRUCTIONS } from './prompts/brief-instructions.ts';
import { leaf } from '@stateforge-labs/session-ledger';
import { causeOf } from '@stateforge-labs/session-ledger';
import { parseText, textOf, type Text } from '@stateforge-labs/session-ledger';
import { unfencedText } from './prompts/recap-prompt.ts';

export class HarnessBrief implements BriefWriter {
    readonly backend: Text;
    readonly job: Text;
    private readonly harness: HarnessPort;
    private readonly settings: HarnessChoice;

    constructor(harness: HarnessPort, settings: HarnessChoice) {
        this.harness = harness;
        this.settings = settings;
        this.backend = harness.label(settings);
        this.job = must(parseText([harness.id, settings.model, settings.effort === 'default' ? '' : settings.effort].filter((part) => part !== '').join(' · ')));
    }

    async write(source: Text, correction?: Text): Promise<BriefWritten> {
        const document = correction === undefined ? source : textOf(`${source}\n${leaf('correction', {}, correction)}`);
        const call: HarnessAsk = { instructions: textOf(BRIEF_INSTRUCTIONS), input: document };
        if (this.harness.limit !== null && Buffer.byteLength(document) + Buffer.byteLength(BRIEF_INSTRUCTIONS) > this.harness.limit) {
            return unknown({ why: 'unreadable', detail: causeOf(must(parseText(`the document is too long for ${this.harness.id}`))) });
        }
        const ran = await this.harness.run(call, this.settings);
        return isUnknown(ran) ? ran : { kind: 'briefed', text: unfencedText(ran.text) };
    }
}
