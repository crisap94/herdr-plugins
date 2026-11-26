import { contextOf } from '@stateforge-labs/session-ledger';
import type { ContextUse } from '@stateforge-labs/session-ledger';
import type { ContextObserved as Observed } from '@stateforge-labs/session-ledger';
import type { CompactLimits } from '#src/ports/compact-limits.ts';
import type { ContextWindowLookup } from '#src/ports/context-windows.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import type { SessionKey } from '#src/recap/domain/ids.ts';
import type { FollowedSession } from '#src/recap/domain/lane.ts';
import { parseCount, countOf } from '@stateforge-labs/session-ledger';
import type { Count } from '@stateforge-labs/session-ledger';
import { parseText, textOf } from '@stateforge-labs/session-ledger';
import type { Text } from '@stateforge-labs/session-ledger';
import type { ObservedResult } from '@stateforge-labs/session-ledger';
import { isUnknown } from '@stateforge-labs/session-ledger';
import type { TranscriptRegistry } from '@stateforge-labs/session-ledger';

const TAIL_BYTES = countOf(256 * 1024);
const REMEMBERED = 200;

const keyOf = (use: ContextUse | null | undefined): Text => textOf(use === null || use === undefined ? '' : `${use.tokens} ${use.window} ${use.source}`);

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
    private readonly setting: () => Count | null;
    private readonly known = new Map<SessionKey, ContextUse | null>();

    constructor(transcripts: TranscriptRegistry, windows: ContextWindowLookup, limits: CompactLimits, setting: () => Count | null) {
        this.transcripts = transcripts;
        this.windows = windows;
        this.limits = limits;
        this.setting = setting;
    }

    private settingCount(): Count | null {
        return this.setting();
    }

    of(pane: SessionKey): ContextUse | null {
        return this.known.get(pane) ?? null;
    }

    private async observedIn(lane: FollowedSession): Promise<ObservedOutcome> {
        const agent = lane.agent;
        const reader = this.transcripts.readerFor(agent);
        const located = reader === undefined ? null : await reader.locate(lane);
        return reader?.observed === undefined || located === null || isUnknown(located) ? null : reader.observed(located.source, TAIL_BYTES);
    }

    private async read(lane: FollowedSession): Promise<ContextUse | null | undefined> {
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

    private capped(use: ContextUse, lane: FollowedSession, observed: Observed): ContextUse {
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

    async refresh(lane: FollowedSession): Promise<Presence> {
        const use = await this.read(lane);
        const pane = lane.pane;
        if (use === undefined || keyOf(use) === keyOf(this.known.get(pane))) {
            return 'absent';
        }
        this.known.delete(pane);
        this.known.set(pane, use);
        if (this.known.size > REMEMBERED) {
            const oldest = this.known.keys().next().value;
            if (oldest !== undefined) {
                this.known.delete(oldest);
            }
        }
        return 'present';
    }
}
