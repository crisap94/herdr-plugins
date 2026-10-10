import { contextOf } from '#src/recap/domain/compaction.ts';
import type { ContextUse } from '#src/recap/domain/compaction.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { ModelCatalogue } from '#src/ports/model-catalogue.ts';
import type { ObservedResult } from '#src/ports/transcripts.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { registryOf } from '#src/ports/transcripts.ts';
import type { TranscriptRegistryInput } from '#src/ports/transcripts.ts';

const TAIL_BYTES = 256 * 1024;
const REMEMBERED = 200;

const keyOf = (use: ContextUse | null | undefined): string => (use === null || use === undefined ? '' : `${use.tokens} ${use.window} ${use.source}`);

export class LaneContexts {
    private readonly transcripts: TranscriptRegistryInput;
    private readonly catalogue: ModelCatalogue;
    private readonly setting: () => number | null;
    private readonly known = new Map<string, ContextUse | null>();

    constructor(transcripts: TranscriptRegistryInput, catalogue: ModelCatalogue, setting: () => number | null) {
        this.transcripts = transcripts;
        this.catalogue = catalogue;
        this.setting = setting;
    }

    of(pane: string): ContextUse | null {
        return this.known.get(pane) ?? null;
    }

    private async observedIn(lane: Lane): Promise<ObservedResult | null> {
        const agent = String(lane.agent);
        const reader = registryOf(this.transcripts).readerFor(agent);
        const located = reader === undefined ? null : await reader.locate(lane);
        return reader?.observed === undefined || located === null || isUnknown(located) ? null : reader.observed(located.source, TAIL_BYTES);
    }

    private async read(lane: Lane): Promise<ContextUse | null | undefined> {
        const found = await this.observedIn(lane);
        if (found === null || isUnknown(found)) {
            return undefined;
        }
        const { observed } = found;
        return observed === null ? null : contextOf({ observed, agent: String(lane.agent), setting: this.setting(), catalogued: observed.model === null ? null : this.catalogue.windowOf(observed.model) });
    }

    async refresh(lane: Lane): Promise<boolean> {
        const use = await this.read(lane);
        const pane = String(lane.pane);
        if (use === undefined || keyOf(use) === keyOf(this.known.get(pane))) {
            return false;
        }
        this.known.delete(pane);
        this.known.set(pane, use);
        if (this.known.size > REMEMBERED) {
            this.known.delete(this.known.keys().next().value ?? '');
        }
        return true;
    }
}
