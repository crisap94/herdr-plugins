// The plugin's own events on herdr's stream, as `tab-recap-event`: a lane's events on its pane, the daemon's and a lane's closing on its workspace.
// Written only while `TAB_RECAP_HERDR_EVENTS` is on; when it goes off, the events tab-recap wrote are cleared. A sequence number per pane and per
// workspace, from the daemon's start, so a restart never reuses one.
import type { EventKind } from '#src/recap/domain/event-token.ts';
import { EVENT_TOKEN, EVENT_TTL_MS, eventValue, seqOf } from '#src/recap/domain/event-token.ts';
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import type { WorkspaceTokens } from '#src/ports/workspace-tokens.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';

/** What the daemon's parts hand an event to: a lane's pane, or a workspace. */
export interface LaneEvents {
    lane(pane: string, kind: EventKind, detail?: string | null): void;
    inWorkspace(workspace: string, kind: EventKind, detail?: string | null): void;
}

export interface EventDeps {
    readonly tokens: LaneTokens;
    readonly workspaces: WorkspaceTokens;
    readonly enabled: () => boolean;
    /** the daemon's start, epoch ms: the base of the sequence numbers */
    readonly startedAt: number;
    readonly log: (line: string) => void;
}

type Target = 'pane' | 'workspace';
/** a sequence: its base and how many events it has counted; `at` is when it last counted one */
interface Counter { readonly base: number; n: number; at: number }
/** a sequence unused for this long is forgotten (a pane that comes back starts again from now, above every number it used) */
const KEEP_MS = 3_600_000;

export class EventStream implements LaneEvents {
    private readonly deps: EventDeps;
    private readonly counts = new Map<string, Counter>();
    /** every target that ever had an event: one forgotten by `prune` starts again from now, never from the start (no number is reused) */
    private readonly used = new Set<string>();
    /** the targets that carry an event of ours now, so turning off can clear them */
    private readonly carrying = new Map<string, { readonly target: Target; readonly id: string }>();
    private wasOn = false;

    constructor(deps: EventDeps) {
        this.deps = deps;
    }

    lane(pane: string, kind: EventKind, detail?: string | null): void {
        this.emit('pane', pane, kind, detail);
    }

    inWorkspace(workspace: string, kind: EventKind, detail?: string | null): void {
        this.emit('workspace', workspace, kind, detail);
    }

    /** The daemon's start or stop, on every workspace herdr lists. */
    async daemon(kind: 'daemon-started' | 'daemon-stopping', version: string): Promise<void> {
        if (!this.deps.enabled()) {
            return;
        }
        const found = await this.deps.workspaces.workspaces();
        if (isUnknown(found)) {
            this.deps.log(`event ${kind}: no workspace listed (${saying(found.why)})`);
            return;
        }
        await Promise.all(found.ids.map((workspace) => this.write('workspace', workspace, kind, this.nextFor('workspace', workspace), version)));
    }

    /** Called each second: when the setting has gone off, the events of ours are cleared (every target that carried one, and every workspace). */
    tick(): void {
        if (this.deps.enabled()) {
            this.wasOn = true;
        } else if (this.wasOn) {
            this.wasOn = false;
            void this.clearAll();
        }
    }

    /** Forgets the sequences unused for an hour; called from the daemon's resync. */
    prune(now: number): void {
        for (const [key, counter] of this.counts) {
            if (now - counter.at > KEEP_MS) {
                this.counts.delete(key);
            }
        }
    }

    private emit(target: Target, id: string, kind: EventKind, detail?: string | null): void {
        if (!this.deps.enabled()) {
            return;
        }
        this.carrying.set(keyOf(target, id), { target, id });
        void this.write(target, id, kind, this.nextFor(target, id), detail ?? null);
    }

    private async write(target: Target, id: string, kind: EventKind, seq: string, detail: string | null): Promise<void> {
        const value = eventValue(seq, kind, detail);
        const done = target === 'pane' ? await this.deps.tokens.report(id, { [EVENT_TOKEN]: value }, EVENT_TTL_MS) : await this.deps.workspaces.reportWorkspace(id, { [EVENT_TOKEN]: value }, EVENT_TTL_MS);
        if (isUnknown(done)) {
            this.deps.log(`event ${kind} on ${id}: not written (${saying(done.why)})`);
        }
    }

    private async clearAll(): Promise<void> {
        const targets = new Map(this.carrying);
        this.carrying.clear();
        const listed = await this.deps.workspaces.workspaces();
        for (const id of isUnknown(listed) ? [] : listed.ids) {
            targets.set(keyOf('workspace', id), { target: 'workspace', id });
        }
        await Promise.all([...targets.values()].map(({ target, id }) => this.clear(target, id)));
    }

    private async clear(target: Target, id: string): Promise<void> {
        const tokens = { [EVENT_TOKEN]: null };
        const done = target === 'pane' ? await this.deps.tokens.report(id, tokens, EVENT_TTL_MS) : await this.deps.workspaces.reportWorkspace(id, tokens, EVENT_TTL_MS);
        if (isUnknown(done)) {
            this.deps.log(`event token on ${id}: not cleared (${saying(done.why)})`);
        }
    }

    /** The next sequence number of a target. A target's first sequence starts at the daemon's start; one forgotten starts again from now. */
    private nextFor(target: Target, id: string): string {
        const key = keyOf(target, id);
        const now = Date.now();
        const base = this.used.has(key) ? Math.floor(now) : Math.floor(this.deps.startedAt);
        const counter = this.counts.get(key) ?? { base, n: 0, at: now };
        this.used.add(key);
        const seq = seqOf(counter.base, counter.n);
        this.counts.set(key, { base: counter.base, n: counter.n + 1, at: now });
        return seq;
    }
}

const keyOf = (target: Target, id: string): string => `${target}:${id}`;

/** A recap run wrote a tab's ledger: each of the tab's lanes is told `recap-written` with the trigger (`imported` runs are not new recaps). */
export function recapWritten(events: LaneEvents, lanes: readonly { readonly pane: string }[], cause: string | undefined): void {
    if (cause === undefined || cause === 'imported') {
        return;
    }
    for (const lane of lanes) {
        events.lane(lane.pane, 'recap-written', cause);
    }
}
