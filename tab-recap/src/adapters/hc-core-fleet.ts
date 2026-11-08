import { AsyncQueue } from '#src/recap/application/async-queue.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import type { Count } from '#src/recap/domain/count.ts';
import type { PaneId, SessionId, TabId } from '#src/recap/domain/ids.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { must } from '#src/protocol/result.ts';
import type { ClosedAll, Done, LayoutResult, OpenResult } from '#src/ports/columns.ts';
import type { Fleet } from '#src/ports/fleet.ts';
import type { Frame, SnapshotResult, StreamResult } from '#src/ports/fleet-source.ts';
import type { Harnesses, HarnessesResult } from '#src/ports/harnesses.ts';
import type { Notified } from '#src/ports/notifier.ts';
import type { PaneTokensResult } from '#src/ports/pane-tokens.ts';
import type { ScreenResult } from '#src/ports/screens.ts';
import { unknown } from '#src/ports/unknowable.ts';
import type { Unknown } from '#src/ports/unknowable.ts';
import type { WorkspacesResult } from '#src/ports/workspace-tokens.ts';
import { HC_CALL_TIMEOUT, HC_LIST_METHOD, HC_SHUT, HC_NO_COLUMN, HC_NO_NOTICE, HC_ODD_LISTING, HC_ODD_SCREEN, HC_READ_METHOD } from './desktop-constants.ts';
import { HcCoreAgents } from './hc-core-agents.ts';
import type { HcSeenResult } from './hc-core-agents.ts';
import { CoreEvents } from './hc-core-events.ts';
import type { CoreEventsTiming } from './hc-core-events.ts';
import { CoreLink } from './hc-core-link.ts';
import type { CoreLinkTiming } from './hc-core-link.ts';
import { HcCoreRoster, parseHcListed } from './hc-core-roster.ts';
import { hcCoreSocketPath, parseHcParams } from './hc-core-wire.ts';
import type { HcParams, SocketPath } from './hc-core-wire.ts';
import type { SessionOfTerminal } from './hc-sessions.ts';

type Phase = 'cold' | 'warm';
type Life = 'up' | 'shut';

const ZERO = must(parseCount(0));
const NO_PARAMS: HcParams = must(parseHcParams({}));

export interface HcCoreFleetParts {
    readonly harnesses: Harnesses;
    readonly sessions: SessionOfTerminal;
    readonly path?: SocketPath;
    readonly linkTiming?: CoreLinkTiming;
    readonly eventsTiming?: CoreEventsTiming;
}

export class HcCoreFleet implements Fleet {
    private readonly harnesses: Harnesses;
    private readonly sessions: SessionOfTerminal;
    private readonly path: SocketPath;
    private readonly eventsTiming: CoreEventsTiming | undefined;
    private readonly link: CoreLink;
    private readonly roster: HcCoreRoster;
    private readonly streams = new Set<CoreEvents>();
    private screens: Count = ZERO;
    private phase: Phase = 'cold';
    private life: Life = 'up';

    constructor(parts: HcCoreFleetParts) {
        this.harnesses = parts.harnesses;
        this.sessions = parts.sessions;
        this.path = parts.path ?? hcCoreSocketPath();
        this.eventsTiming = parts.eventsTiming;
        this.link = new CoreLink(parts.linkTiming === undefined ? { path: this.path } : { path: this.path, timing: parts.linkTiming });
        this.roster = new HcCoreRoster(parts.sessions);
    }

    private async load(): Promise<Unknown | null> {
        const folded = this.roster.revision;
        const answer = await this.link.call(HC_LIST_METHOD, NO_PARAMS, HC_CALL_TIMEOUT);
        if (answer.kind === 'unknown') {
            return answer;
        }
        const listed = parseHcListed(answer.value);
        if (listed.kind === 'err') {
            return unknown({ why: 'unreadable', detail: HC_ODD_LISTING });
        }
        if (this.roster.revision === folded) {
            this.roster.load(listed.value.terminals);
        }
        this.phase = 'warm';
        return null;
    }

    private async current(): Promise<Unknown | null> {
        return this.phase === 'warm' ? null : this.load();
    }

    private async seen(pane: PaneId): Promise<HcSeenResult> {
        const failed = await this.current();
        return failed ?? { kind: 'seen', terminal: this.roster.terminal(pane) };
    }

    async sessionOf(pane: PaneId): Promise<SessionId | null | Unknown> {
        const found = await this.seen(pane);
        if (found.kind !== 'seen') {
            return found;
        }
        return found.terminal === null ? null : this.sessions(found.terminal);
    }

    async snapshot(): Promise<SnapshotResult> {
        const failed = await this.load();
        if (failed !== null) {
            return failed;
        }
        return { kind: 'snapshot', seen: { focusedTab: null, lanes: this.roster.lanes(), panes: this.roster.panes(), columns: [], widths: new Map() }, focusedTab: null, paneTokens: new Map() };
    }

    private async pump(events: CoreEvents, queue: AsyncQueue<Frame>): Promise<void> {
        const own = new HcCoreRoster(this.sessions);
        for await (const feed of events.feed) {
            this.roster.fold(feed);
            for (const frame of own.fold(feed)) {
                queue.push(frame);
            }
        }
        queue.end();
        this.streams.delete(events);
    }

    subscribe(): Promise<StreamResult> {
        if (this.life === 'shut') {
            return Promise.resolve(unknown({ why: 'unreachable', detail: HC_SHUT }));
        }
        const queue = new AsyncQueue<Frame>();
        const events = new CoreEvents(this.eventsTiming === undefined ? { path: this.path } : { path: this.path, timing: this.eventsTiming });
        this.streams.add(events);
        events.start();
        void this.pump(events, queue);
        const close = (): void => { void events.close(); queue.end(); this.streams.delete(events); };
        return Promise.resolve({ kind: 'stream', stream: { frames: () => queue, close } });
    }

    async shutdown(): Promise<Done> {
        this.life = 'shut';
        const open = [...this.streams];
        this.streams.clear();
        await Promise.all(open.map((events) => events.close()));
        await this.link.close();
        return { kind: 'done' };
    }

    layout(tab: TabId): Promise<LayoutResult> {
        return Promise.resolve(unknown({ why: 'not-found', what: `the layout of ${tab}` }));
    }

    open(): Promise<OpenResult> {
        return Promise.resolve(unknown({ why: 'unreachable', detail: HC_NO_COLUMN }));
    }

    resize(): Promise<Done> {
        return Promise.resolve({ kind: 'done' });
    }

    close(): Promise<Done> {
        return Promise.resolve({ kind: 'done' });
    }

    closeEvery(): Promise<ClosedAll> {
        return Promise.resolve({ kind: 'closed', closed: 0, failed: 0 });
    }

    available(): Promise<HarnessesResult> {
        return this.harnesses.available();
    }

    async readScreen(pane: PaneId, lines: Count): Promise<ScreenResult> {
        const answer = await this.link.call(HC_READ_METHOD, must(parseHcParams({ terminal: pane, lines: ZERO })), HC_CALL_TIMEOUT);
        if (answer.kind === 'unknown') {
            return answer;
        }
        const text = parseText(Reflect.get(answer.value, 'text'));
        if (text.kind === 'err') {
            return unknown({ why: 'unreadable', detail: HC_ODD_SCREEN });
        }
        const all = text.value.split('\n');
        this.screens = must(parseCount(this.screens + 1));
        return { kind: 'screen', text: all.slice(Math.max(0, all.length - lines)).join('\n'), revision: this.screens, truncated: all.length > lines };
    }

    report(): Promise<Done> {
        return Promise.resolve({ kind: 'done' });
    }

    read(): Promise<PaneTokensResult> {
        return Promise.resolve({ kind: 'tokens', tokens: {} });
    }

    reportWorkspace(): Promise<Done> {
        return Promise.resolve({ kind: 'done' });
    }

    workspaces(): Promise<WorkspacesResult> {
        return Promise.resolve({ kind: 'workspaces', ids: [...new Set(this.roster.lanes().map((lane) => lane.workspaceId))] });
    }

    notify(): Promise<Notified> {
        return Promise.resolve(unknown({ why: 'unreachable', detail: HC_NO_NOTICE }));
    }

    agents(): HcCoreAgents {
        return new HcCoreAgents((pane) => this.seen(pane));
    }
}
