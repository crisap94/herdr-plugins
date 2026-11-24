import type { EventKind } from '#src/recap/domain/event-token.ts';
import { textOf, type Text } from '#src/recap/domain/text.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import { countOf, type Count } from '#src/recap/domain/count.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { EVENT_TOKEN, EVENT_TTL_MS, eventValue, seqOf } from '#src/recap/domain/event-token.ts';
import type { LaneTokenReporter } from '#src/ports/lane-tokens.ts';
import type { WorkspaceTokenMap, WorkspaceTokenReporter } from '#src/ports/workspace-tokens.ts';
import { parseTokenName, parseTokenValue } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import { uncheckedMilliseconds, uncheckedTokenValue, type SessionKey, type WorkspaceId } from '#src/recap/domain/ids.ts';
import { parseMilliseconds } from '#src/recap/domain/time.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';

export interface LaneEvents {
    lane(pane: SessionKey, kind: EventKind, detail?: Text | null): void;
    inWorkspace(workspace: WorkspaceId, kind: EventKind, detail?: Text | null): void;
}

export interface EventDeps {
    readonly tokens: LaneTokenReporter;
    readonly workspaces: WorkspaceTokenReporter;
    readonly enabled: () => Presence;
    readonly startedAt: Instant;
    readonly log: (line: Text) => void;
}

type DaemonKind = 'daemon-started' | 'daemon-stopping';
interface Counter { readonly base: Instant; readonly n: Count; readonly at: Instant }
type Carried = { readonly target: 'pane'; readonly id: SessionKey } | { readonly target: 'workspace'; readonly id: WorkspaceId };
const KEEP_MS = 3_600_000;
const EVENT_NAME = must(parseTokenName(EVENT_TOKEN));
const WORKSPACE_TTL = must(parseMilliseconds(EVENT_TTL_MS));
const PANE_TTL = uncheckedMilliseconds(EVENT_TTL_MS);

export class EventStream implements LaneEvents {
    private readonly deps: EventDeps;
    private readonly counts = new Map<Text, Counter>();
    private readonly used = new Set<Text>();
    private readonly carrying = new Map<Text, Carried>();
    private wasOn: Presence = 'absent';

    constructor(deps: EventDeps) {
        this.deps = deps;
    }

    lane(pane: SessionKey, kind: EventKind, detail?: Text | null): void {
        this.emit({ target: 'pane', id: pane }, kind, detail);
    }

    inWorkspace(workspace: WorkspaceId, kind: EventKind, detail?: Text | null): void {
        this.emit({ target: 'workspace', id: workspace }, kind, detail);
    }

    async daemon(kind: DaemonKind, version: Text): Promise<void> {
        if (this.deps.enabled() === 'absent') {
            return;
        }
        const found = await this.deps.workspaces.workspaces();
        if (isUnknown(found)) {
            this.deps.log(textOf(`event ${kind}: no workspace listed (${saying(found.why)})`));
            return;
        }
        await Promise.all(found.ids.map((workspace) => this.write({ target: 'workspace', id: workspace }, kind, this.nextFor({ target: 'workspace', id: workspace }), version)));
    }

    tick(): void {
        if (this.deps.enabled() === 'present') {
            this.wasOn = 'present';
        } else if (this.wasOn === 'present') {
            this.wasOn = 'absent';
            void this.clearAll();
        }
    }

    prune(now: Instant): void {
        for (const [key, counter] of this.counts) {
            if (now - counter.at > KEEP_MS) {
                this.counts.delete(key);
            }
        }
    }

    private emit(to: Carried, kind: EventKind, detail?: Text | null): void {
        if (this.deps.enabled() === 'absent') {
            return;
        }
        this.carrying.set(keyOf(to), to);
        void this.write(to, kind, this.nextFor(to), detail ?? null);
    }

    private async write(to: Carried, kind: EventKind, seq: Text, detail: Text | null): Promise<void> {
        const value = eventValue(seq, kind, detail);
        const done = to.target === 'pane' ? await this.deps.tokens.report(to.id, new Map([[EVENT_NAME, uncheckedTokenValue(value)]]), PANE_TTL) : await this.deps.workspaces.reportWorkspace(to.id, new Map([[EVENT_NAME, must(parseTokenValue(value))]]), WORKSPACE_TTL);
        if (isUnknown(done)) {
            this.deps.log(textOf(`event ${kind} on ${to.id}: not written (${saying(done.why)})`));
        }
    }

    private async clearAll(): Promise<void> {
        const targets = new Map(this.carrying);
        this.carrying.clear();
        const listed = await this.deps.workspaces.workspaces();
        for (const id of isUnknown(listed) ? [] : listed.ids) {
            targets.set(keyOf({ target: 'workspace', id }), { target: 'workspace', id });
        }
        await Promise.all([...targets.values()].map((to) => this.clear(to)));
    }

    private async clear(to: Carried): Promise<void> {
        const cleared: WorkspaceTokenMap = new Map([[EVENT_NAME, null]]);
        const done = to.target === 'pane' ? await this.deps.tokens.report(to.id, new Map([[EVENT_NAME, null]]), PANE_TTL) : await this.deps.workspaces.reportWorkspace(to.id, cleared, WORKSPACE_TTL);
        if (isUnknown(done)) {
            this.deps.log(textOf(`event token on ${to.id}: not cleared (${saying(done.why)})`));
        }
    }

    private nextFor(to: Carried): Text {
        const key = keyOf(to);
        const now = instant(Date.now());
        const base = instant(Math.floor(this.used.has(key) ? now : this.deps.startedAt));
        const counter = this.counts.get(key) ?? { base, n: countOf(0), at: now };
        this.used.add(key);
        const seq = seqOf(counter.base, counter.n);
        this.counts.set(key, { base: counter.base, n: countOf(counter.n + 1), at: now });
        return seq;
    }
}

const keyOf = (to: Carried): Text => textOf(`${to.target}:${to.id}`);

interface PaneRef { readonly pane: SessionKey }

export function recapWritten(events: LaneEvents, lanes: readonly PaneRef[], cause: Text | undefined): void {
    if (cause === undefined || cause === 'imported') {
        return;
    }
    for (const lane of lanes) {
        events.lane(lane.pane, 'recap-written', cause);
    }
}
