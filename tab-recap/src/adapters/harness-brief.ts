import type { CompactionBriefs, Briefed } from '#src/ports/compaction-briefs.ts';
import type { Harness, HarnessSettings } from '#src/ports/harness.ts';
import { isUnknown, unknown } from '#src/ports/unknowable.ts';
import { BRIEF_INSTRUCTIONS } from './brief-instructions.ts';
import { leaf } from '#src/recap/application/xml.ts';
import { unfenced } from './recap-prompt.ts';

export class HarnessBrief implements CompactionBriefs {
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

    async write(source: string, correction?: string): Promise<Briefed> {
        const document = correction === undefined ? source : `${source}\n${leaf('correction', {}, correction)}`;
        const call = { instructions: BRIEF_INSTRUCTIONS, input: document };
        if (this.harness.limit !== null && Buffer.byteLength(document) + Buffer.byteLength(BRIEF_INSTRUCTIONS) > this.harness.limit) {
            return unknown({ why: 'unreadable', detail: `the document is too long for ${this.harness.id}` });
        }
        const ran = await this.harness.run(call, this.settings);
        return isUnknown(ran) ? ran : { kind: 'briefed', text: unfenced(ran.text) };
    }
}
