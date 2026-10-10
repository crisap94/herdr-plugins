import { contextOf } from '#src/recap/domain/compaction.ts';
import type { ContextUse } from '#src/recap/domain/compaction.ts';
import type { ContextWindows } from '#src/ports/context-windows.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { ObservedResult } from '#src/ports/transcripts.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import type { TranscriptRegistry } from '#src/ports/transcript-registry.ts';

const TAIL_BYTES = 256 * 1024;
const REMEMBERED = 200;

const keyOf = (use: ContextUse | null | undefined): string => (use === null || use === undefined ? '' : `${use.tokens} ${use.window} ${use.source}`);

export class LaneContexts {
    private readonly transcripts: TranscriptRegistry;
    private readonly windows: ContextWindows;
    private readonly setting: () => number | null;
    private readonly known = new Map<string, ContextUse | null>();

    constructor(transcripts: TranscriptRegistry, windows: ContextWindows, setting: () => number | null) {
        this.transcripts = transcripts;
        this.windows = windows;
        this.setting = setting;
    }

    of(pane: string): ContextUse | null {
        return this.known.get(pane) ?? null;
    }

    private async observedIn(lane: Lane): Promise<ObservedResult | null> {
        const agent = String(lane.agent);
        const reader = this.transcripts.readerFor(agent);
        const located = reader === undefined ? null : await reader.locate(lane);
        return reader?.observed === undefined || located === null || isUnknown(located) ? null : reader.observed(located.source, TAIL_BYTES);
    }

    private async read(lane: Lane): Promise<ContextUse | null | undefined> {
        const found = await this.observedIn(lane);
        if (found === null || isUnknown(found)) {
            return undefined;
        }
        const { observed } = found;
        return observed === null ? null : contextOf({ observed, setting: this.setting() }, this.windows.windowOf(String(lane.agent)));
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
