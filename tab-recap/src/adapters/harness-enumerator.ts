import type { Enumerated, Enumerators } from '#src/ports/enumerators.ts';
import type { Harness, HarnessSettings } from '#src/ports/harness.ts';
import { isUnknown, unknown } from '#src/ports/unknowable.ts';
import { ENUMERATE_INSTRUCTIONS } from './enumerate-instructions.ts';
import { unfenced } from './recap-prompt.ts';

export class HarnessEnumerator implements Enumerators {
    readonly backend: string;
    readonly job: string;
    private readonly harness: Harness;
    private readonly settings: HarnessSettings;

    constructor(harness: Harness, settings: HarnessSettings) {
        this.harness = harness;
        this.settings = settings;
        this.backend = harness.label(settings);
        this.job = [harness.id, settings.model, settings.effort === 'default' ? '' : settings.effort].filter((part) => part !== '').join(' · ');
    }

    async write(document: string): Promise<Enumerated> {
        const call = { instructions: ENUMERATE_INSTRUCTIONS, input: document };
        if (this.harness.limit !== null && Buffer.byteLength(document) + Buffer.byteLength(ENUMERATE_INSTRUCTIONS) > this.harness.limit) {
            return unknown({ why: 'unreadable', detail: `the document is too long for ${this.harness.id}` });
        }
        const ran = await this.harness.run(call, this.settings);
        return isUnknown(ran) ? ran : { kind: 'enumerated', text: unfenced(ran.text), costUsd: ran.costUsd };
    }
}
