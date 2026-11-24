import type { Enumerated } from '@stateforge-labs/session-ledger';
import type { LegacyEnumerator as Enumerator } from '@stateforge-labs/session-ledger';
import type { HarnessAsk, HarnessChoice, HarnessPort } from '#src/ports/harness.ts';
import { isUnknown, unknown } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { causeOf } from '@stateforge-labs/session-ledger';
import { parseText, textOf, type Text } from '@stateforge-labs/session-ledger';
import { ENUMERATE_INSTRUCTIONS } from './prompts/enumerate-instructions.ts';
import { unfencedText } from './prompts/recap-prompt.ts';

export class HarnessEnumerator implements Enumerator {
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

    async write(document: Text): Promise<Enumerated> {
        const call: HarnessAsk = { instructions: textOf(ENUMERATE_INSTRUCTIONS), input: document };
        if (this.harness.limit !== null && Buffer.byteLength(document) + Buffer.byteLength(ENUMERATE_INSTRUCTIONS) > this.harness.limit) {
            return unknown({ why: 'unreadable', detail: causeOf(must(parseText(`the document is too long for ${this.harness.id}`))) });
        }
        const ran = await this.harness.run(call, this.settings);
        return isUnknown(ran) ? ran : { kind: 'enumerated', text: unfencedText(ran.text), costUsd: ran.costUsd };
    }
}
