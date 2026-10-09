// The plugin's own events on herdr's stream: each one is written as `tab-recap-event` on the lane's pane (or, for the daemon, on every workspace).
// Written only while `TAB_RECAP_HERDR_EVENTS` is on. A sequence number per pane and per workspace, from the daemon's start.
import type { EventKind } from '#src/recap/domain/event-token.ts';
import { EVENT_KINDS, EVENT_TOKEN, EVENT_TTL_MS, eventValue, seqOf } from '#src/recap/domain/event-token.ts';
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import type { WorkspaceTokens } from '#src/ports/workspace-tokens.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';

/** What the daemon's parts hand an event to: a lane's pane, by kind and detail. */
export interface LaneEvents {
    lane(pane: string, kind: EventKind, detail?: string | null): void;
}

/** A recap run wrote a tab's ledger: each of the tab's lanes is told `recap-written` with the trigger (`imported` runs are not new recaps). */
export function recapWritten(events: LaneEvents, lanes: readonly { readonly pane: string }[], cause: string | undefined): void {
    if (cause === undefined || cause === 'imported') return;
    for (const lane of lanes) events.lane(lane.pane, 'recap-written', cause);
}

export interface EventDeps {
    readonly tokens: LaneTokens;
    readonly workspaces: WorkspaceTokens;
    readonly enabled: () => boolean;
    /** the daemon's start, epoch ms: the base of every sequence number */
    readonly startedAt: number;
    readonly log: (line: string) => void;
}

export class HerdrEvents implements LaneEvents {
    private readonly deps: EventDeps;
    private readonly counts = new Map<string, number>();

    constructor(deps: EventDeps) {
        this.deps = deps;
    }

    lane(pane: string, kind: EventKind, detail?: string | null): void {
        if (!this.deps.enabled()) {
            return;
        }
        void this.write(pane, kind, eventValue(this.next(pane), kind, detail));
    }

    private async write(pane: string, kind: EventKind, value: string): Promise<void> {
        const done = await this.deps.tokens.report(pane, { [EVENT_TOKEN]: value }, EVENT_TTL_MS);
        if (isUnknown(done)) {
            this.deps.log(`event ${kind} on ${pane}: not written (${saying(done.why)})`);
        }
    }

    /** The daemon's start or stop, on every workspace herdr has. */
    async daemon(kind: 'daemon-started' | 'daemon-stopping', version: string): Promise<void> {
        if (!this.deps.enabled() || !EVENT_KINDS.includes(kind)) {
            return;
        }
        const found = await this.deps.workspaces.workspaces();
        if (isUnknown(found)) {
            this.deps.log(`event ${kind}: no workspace listed (${saying(found.why)})`);
            return;
        }
        for (const workspace of found.ids) {
            const value = eventValue(this.next(`workspace:${workspace}`), kind, version);
            void this.deps.workspaces.reportWorkspace(workspace, { [EVENT_TOKEN]: value }, EVENT_TTL_MS);
        }
    }

    private next(key: string): string {
        const n = this.counts.get(key) ?? 0;
        this.counts.set(key, n + 1);
        return seqOf(this.deps.startedAt, n);
    }
}
