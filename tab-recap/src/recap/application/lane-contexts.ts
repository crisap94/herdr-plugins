import { contextOf } from '#src/recap/domain/compaction.ts';
import type { ContextUse, Observed } from '#src/recap/domain/compaction.ts';
import type { CompactLimits } from '#src/ports/compact-limits.ts';
import type { ContextWindowLookup } from '#src/ports/context-windows.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { parseCount, countOf } from '#src/recap/domain/count.ts';
import type { Count } from '#src/recap/domain/count.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { ObservedResult } from '#src/ports/transcripts.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import type { TranscriptRegistry } from '#src/ports/transcript-registry.ts';

const TAIL_BYTES = countOf(256 * 1024);
const REMEMBERED = 200;

const keyOf = (use: ContextUse | null | undefined): string => (use === null || use === undefined ? '' : `${use.tokens} ${use.window} ${use.source}`);

type ObservedOutcome = ObservedResult | null;

const capAt = (base: Count, percent: Count | null): Count => {
    if (percent === null) {
        return base;
    }
    const count = parseCount(Math.floor(base * percent / 100));
    return count.kind === 'ok' ? count.value : base;
};

export class LaneContexts {
    private readonly transcripts: TranscriptRegistry;
    private readonly windows: ContextWindowLookup;
    private readonly limits: CompactLimits;
    private readonly setting: () => number | null;
    private readonly known = new Map<string, ContextUse | null>();

    constructor(transcripts: TranscriptRegistry, windows: ContextWindowLookup, limits: CompactLimits, setting: () => number | null) {
        this.transcripts = transcripts;
        this.windows = windows;
        this.limits = limits;
        this.setting = setting;
    }

    private settingCount(): Count | null {
        const value = this.setting();
        return value === null ? null : countOf(value);
    }

    of(pane: string): ContextUse | null {
        return this.known.get(pane) ?? null;
    }

    private async observedIn(lane: Lane): Promise<ObservedOutcome> {
        const agent = lane.agent;
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
        if (observed === null) {
            return null;
        }
        const use = contextOf({ observed, setting: this.settingCount() }, this.windows.windowOf(lane.agent));
        return use === null || use.source === 'setting' ? use : this.capped(use, lane, observed);
    }

    private capped(use: ContextUse, lane: Lane, observed: Observed): ContextUse {
        const model = parseText(observed.model);
        const limit = this.limits.limitOf(lane.agent, model.kind === 'ok' ? model.value : null, lane.cwd, lane.session);
        const measured = parseCount(use.window);
        if (measured.kind !== 'ok') {
            return use;
        }
        const base = limit.window !== null && limit.window < measured.value ? limit.window : measured.value;
        const cap = capAt(base, limit.percent);
        return cap < measured.value ? { tokens: use.tokens, window: cap, source: 'agent' } : use;
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
