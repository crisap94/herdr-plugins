import type { EventKind } from '#src/recap/domain/event-token.ts';
import { EVENT_TOKEN, EVENT_TTL_MS, eventValue, seqOf } from '#src/recap/domain/event-token.ts';
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import type { WorkspaceTokens } from '#src/ports/workspace-tokens.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';

export interface LaneEvents {
    lane(pane: string, kind: EventKind, detail?: string | null): void;
    inWorkspace(workspace: string, kind: EventKind, detail?: string | null): void;
}

export interface EventDeps {
    readonly tokens: LaneTokens;
    readonly workspaces: WorkspaceTokens;
    readonly enabled: () => boolean;
    readonly startedAt: number;
    readonly log: (line: string) => void;
}

type Target = 'pane' | 'workspace';
interface Counter { readonly base: number; n: number; at: number }
const KEEP_MS = 3_600_000;

export class EventStream implements LaneEvents {
    private readonly deps: EventDeps;
    private readonly counts = new Map<string, Counter>();
    private readonly used = new Set<string>();
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

    tick(): void {
        if (this.deps.enabled()) {
            this.wasOn = true;
        } else if (this.wasOn) {
            this.wasOn = false;
            void this.clearAll();
        }
    }

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

export function recapWritten(events: LaneEvents, lanes: readonly { readonly pane: string }[], cause: string | undefined): void {
    if (cause === undefined || cause === 'imported') {
        return;
    }
    for (const lane of lanes) {
        events.lane(lane.pane, 'recap-written', cause);
    }
}
