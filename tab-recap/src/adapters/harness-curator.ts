import type { Curated, Curators } from '#src/ports/curators.ts';
import type { Harness, HarnessSettings } from '#src/ports/harness.ts';
import { isUnknown, unknown } from '#src/ports/unknowable.ts';
import { CURATOR_INSTRUCTIONS } from './curator-instructions.ts';
import { unfenced } from './recap-prompt.ts';

/** The curator: one job on a harness. */
export class HarnessCurator implements Curators {
    readonly backend: string;
    private readonly harness: Harness;
    private readonly settings: HarnessSettings;

    constructor(harness: Harness, settings: HarnessSettings) {
        this.harness = harness;
        this.settings = settings;
        this.backend = harness.label(settings);
    }

    async write(document: string): Promise<Curated> {
        const call = { instructions: CURATOR_INSTRUCTIONS, input: document };
        if (this.harness.limit !== null && Buffer.byteLength(document) + Buffer.byteLength(CURATOR_INSTRUCTIONS) > this.harness.limit) {
            return unknown({ why: 'unreadable', detail: `the document is too long for ${this.harness.id}` });
        }
        const ran = await this.harness.run(call, this.settings);
        return isUnknown(ran) ? ran : { kind: 'curated', text: unfenced(ran.text) };
    }
}
