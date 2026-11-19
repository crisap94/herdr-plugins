import { setTimeout as sleep } from 'node:timers/promises';
import type { DecodedFrame } from '@stateforge-labs/herdr-sdk';
import type { Agents, AgentState, LineBehavior, PromptBehavior, PromptWait, Prompted, PromptStance, PromptWaitFor } from '#src/ports/agents.ts';
import type { ClosedAll, Columns, Done, LayoutResult, OpenResult, ResizeDirection } from '#src/ports/columns.ts';
import type { Harnesses, HarnessesResult } from '#src/ports/harnesses.ts';
import type { ModalHost, SetupOpened } from '#src/ports/modal.ts';
import type { Notified, Notifier } from '#src/ports/notifier.ts';
import type { ScreenResult, Screens } from '#src/ports/screens.ts';
import type { Frame, FleetSource, SnapshotResult, StreamResult, Topic } from '#src/ports/fleet-source.ts';
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import type { PaneTokens, PaneTokensResult } from '#src/ports/pane-tokens.ts';
import type { WorkspaceTokens, WorkspacesResult } from '#src/ports/workspace-tokens.ts';
import { unknown, type Unknown } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import type { TokenMap } from '#src/protocol/tokens.ts';
import { causeOf } from '#src/recap/domain/failure-cause.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import type { CompactionLine } from '#src/recap/domain/compaction-plan.ts';
import type { Shape } from '#src/recap/domain/board.ts';
import type { Reconciliation } from '#src/recap/domain/fold.ts';
import { parsePaneId, parseTabId, tabId, type PaneId, type TabId } from '#src/recap/domain/ids.ts';
import type { Placed, Rect, Split } from '#src/recap/domain/layout.ts';
import type { SeenLane } from '#src/recap/domain/lane.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { parseMilliseconds } from '#src/recap/domain/time.ts';
import { PANE_WRITABLE, WORKSPACE_WRITABLE } from '#src/recap/domain/lane-tokens.ts';
import { AsyncQueue } from '#src/recap/application/async-queue.ts';
import { seenFrom, sessionOf, tokensOf } from '#src/recap/application/decode.ts';
import { agentPanesIn, columnsIn } from './column-panes.ts';
import { HerdrAgentPanes, herdrWire, type Wire } from './agents.ts';
import { usePlugin } from './client.ts';
import { HerdrFleetPorts, PLUGIN_ID, pumpFrames } from './fleet.ts';
import { subscribeTopics } from './subscriptions.ts';
import { sessionOfForKind } from './session-registry.ts';
import { refusalOf } from './token-refusal.ts';
import type { Json } from './json-object.ts';

export function parseJson(value: unknown): Json {
    return typeof value === 'object' && value !== null ? { ...value } : {};
}

export function list(value: unknown): readonly Json[] {
    return Array.isArray(value) ? value.filter((item): item is Json => typeof item === 'object' && item !== null) : [];
}

export function str(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

export function rectOf(value: unknown): Rect {
    const r = parseJson(value);
    const n = (key: string): number => (typeof r[key] === 'number' ? r[key] : 0);
    return { x: n('x'), y: n('y'), width: n('width'), height: n('height') };
}

export function reconciliationOf(snapshot: Json): Reconciliation {
    const panes = list(snapshot['panes']);
    const agents = agentPanesIn(panes, list(snapshot['agents']));
    const lanes = list(snapshot['agents']).map((agent) => seenFrom(agent, sessionOfForKind)).filter((lane): lane is SeenLane => lane !== null);
    const widths = new Map(list(snapshot['layouts']).map((layout) => [str(layout['tab_id']), rectOf(layout['area']).width]));
    const focused = str(snapshot['focused_tab_id']);
    const tabs = Array.isArray(snapshot['tabs']) ? { tabs: list(snapshot['tabs']).map((tab) => str(tab['tab_id'])).filter((tab) => tab !== '').map((tab) => tabId(tab)) } : {};
    return { focusedTab: focused === '' ? null : focused, lanes, panes: panes.map((pane) => str(pane['pane_id'])), columns: columnsIn(panes, agents), widths, ...tabs };
}

export function paneTokensOf(snapshot: Json): ReadonlyMap<string, TokenMap> {
    return new Map(list(snapshot['panes']).flatMap((pane) => {
        const found = tokensOf(pane);
        return found === null ? [] : [[found.pane, found.tokens] as const];
    }));
}

export function layoutOf(layout: Json): LayoutResult {
    const panes: Placed[] = list(layout['panes']).map((pane) => ({ paneId: str(pane['pane_id']), rect: rectOf(pane['rect']) }));
    const splits: Split[] = list(layout['splits']).map((split) => ({
        direction: str(split['direction']),
        ratio: typeof split['ratio'] === 'number' ? split['ratio'] : 0.5,
        rect: rectOf(split['rect']),
    }));
    const area = rectOf(layout['area']);
    const focused = str(layout['focused_pane_id']);
    return { kind: 'layout', width: area.width, height: area.height, focused: focused === '' ? null : focused, panes, splits };
}

const detail = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const legacyFrameOf = (frame: DecodedFrame): Frame => ({ event: frame.event, data: 'data' in frame ? parseJson(frame.data) : {} });

const paneOf = (pane: string): PaneId | null => {
    const found = parsePaneId(pane);
    return found.kind === 'ok' ? found.value : null;
};

const tabOf = (tab: string): TabId | null => {
    const found = parseTabId(tab);
    return found.kind === 'ok' ? found.value : null;
};

export async function readPaneSession(pane: string): Promise<string | null | Unknown> {
    try {
        const info = parseJson(await usePlugin((client) => client.call('pane.get', { pane_id: pane })))['pane'];
        return typeof info === 'object' && info !== null ? sessionOf(parseJson(info), sessionOfForKind) : null;
    } catch (error) {
        return unknown({ why: 'unreachable', detail: causeOf(must(parseText(detail(error)))) });
    }
}

export class HerdrAgents implements Agents {
    private readonly panes: HerdrAgentPanes;

    constructor(wire: Wire, plugin: { readonly id: string; readonly stateDir: string }, pause: (ms: number) => Promise<void> = sleep) {
        this.panes = new HerdrAgentPanes(wire, { id: must(parseText(plugin.id)), stateDir: must(parseText(plugin.stateDir)) }, (wait) => pause(Number(wait)));
    }

    async status(pane: string): Promise<AgentState> {
        const id = paneOf(pane);
        return id === null ? unknown({ why: 'not-found', what: `agent ${pane}` }) : this.panes.status(id);
    }

    async prompt(pane: string, text: string, wait: PromptWait | undefined, behavior: PromptBehavior): Promise<Prompted> {
        const id = paneOf(pane);
        const body = parseText(text);
        if (id === null) {
            return unknown({ why: 'not-found', what: `agent ${pane}` });
        }
        if (body.kind !== 'ok') {
            return unknown({ why: 'unreadable', detail: causeOf(must(parseText('prompt text is empty'))) });
        }
        const stance: PromptStance = { stall: behavior.acceptsStall ? 'accepts-stall' : 'refuses-stall' };
        const waitFor: PromptWaitFor | undefined = wait === undefined
            ? undefined
            : { until: wait.until.flatMap((item) => { const found = parseText(item); return found.kind === 'ok' ? [found.value] : []; }), timeout: must(parseMilliseconds(wait.timeoutMs)) };
        return this.panes.prompt(id, body.value, waitFor, stance);
    }

    async typeLine(pane: string, line: CompactionLine, behavior: LineBehavior): Promise<Prompted> {
        const id = paneOf(pane);
        return id === null ? unknown({ why: 'not-found', what: `agent ${pane}` }) : this.panes.typeLine(id, line, behavior);
    }

    async askNote(tab: string, pane: string | null): Promise<Done> {
        const tabIdentity = tabOf(tab);
        const paneIdentity = pane === null ? null : paneOf(pane);
        if (tabIdentity === null || (pane !== null && paneIdentity === null)) {
            return unknown({ why: 'not-found', what: `tab ${tab}` });
        }
        return this.panes.askNote(tabIdentity, paneIdentity);
    }
}

export class HerdrFleet implements FleetSource, Columns, ModalHost, Harnesses, Notifier, Screens, LaneTokens, PaneTokens, WorkspaceTokens {
    private readonly stateDir: string;
    private readonly ports: HerdrFleetPorts;

    constructor(stateDir: string) {
        this.stateDir = stateDir;
        this.ports = new HerdrFleetPorts(must(parseText(stateDir)));
    }

    agents(): HerdrAgents {
        return new HerdrAgents(herdrWire, { id: PLUGIN_ID, stateDir: this.stateDir });
    }

    async snapshot(): Promise<SnapshotResult> {
        try {
            const snap = await this.ports.rawSnapshot();
            const focused = str(snap['focused_tab_id']);
            return { kind: 'snapshot', seen: reconciliationOf(snap), focusedTab: focused === '' ? null : focused, paneTokens: paneTokensOf(snap) };
        } catch (error) {
            return unknown({ why: 'unreachable', detail: causeOf(must(parseText(detail(error)))) });
        }
    }

    async subscribe(topics: readonly Topic[]): Promise<StreamResult> {
        const queue = new AsyncQueue<Frame>();
        try {
            const live = await subscribeTopics(topics);
            pumpFrames(live, queue, legacyFrameOf);
            return { kind: 'stream', stream: { frames: (): AsyncIterable<Frame> => queue, close: (): void => { live.close(); queue.end(); } } };
        } catch (error) {
            return unknown({ why: 'unreachable', detail: causeOf(must(parseText(detail(error)))) });
        }
    }

    async layout(tab: TabId): Promise<LayoutResult> {
        try {
            const layout = list((await this.ports.rawSnapshot())['layouts']).find((candidate) => candidate['tab_id'] === String(tab));
            return layout === undefined ? unknown({ why: 'not-found', what: `the layout of ${tab}` }) : layoutOf(layout);
        } catch (error) {
            return unknown({ why: 'unreachable', detail: causeOf(must(parseText(detail(error)))) });
        }
    }

    async open(tab: TabId, target: string, shape: Shape): Promise<OpenResult> {
        return this.ports.open(tab, must(parseText(target)), shape);
    }

    async show(tab: TabId): Promise<Done> {
        return this.ports.show(tab);
    }

    async setup(tab: TabId | null): Promise<SetupOpened> {
        return this.ports.setup(tab);
    }

    async available(): Promise<HarnessesResult> {
        try {
            const ids = list(parseJson(await usePlugin((client) => client.call('integration.list', {})))['integrations'])
                .filter((entry) => entry['available'] === true)
                .map((entry) => str(entry['target']));
            return { kind: 'available', ids };
        } catch (error) {
            return unknown({ why: 'unreachable', detail: causeOf(must(parseText(detail(error)))) });
        }
    }

    async readScreen(pane: string, lines: number): Promise<ScreenResult> {
        try {
            const fields = parseJson(parseJson(await usePlugin((client) => client.call('pane.read', { pane_id: pane, source: 'recent_unwrapped', lines, format: 'text' })))['read']);
            return typeof fields['text'] === 'string'
                ? { kind: 'screen', text: fields['text'], revision: typeof fields['revision'] === 'number' ? fields['revision'] : 0, truncated: fields['truncated'] === true }
                : unknown({ why: 'unreadable', detail: causeOf(must(parseText(`pane.read of ${pane} returned no text`))) });
        } catch (error) {
            return unknown({ why: 'unreachable', detail: causeOf(must(parseText(detail(error)))) });
        }
    }

    async report(pane: string, tokens: Readonly<Record<string, string | null>>, ttlMs: number): Promise<Done> {
        const refused = refusalOf(tokens, PANE_WRITABLE);
        return refused ?? this.ports.call(() => usePlugin((client) => client.call('pane.report_metadata', { pane_id: pane, source: PLUGIN_ID, tokens, ttl_ms: ttlMs })));
    }

    async read(pane: PaneId): Promise<PaneTokensResult> {
        return this.ports.read(pane);
    }

    async reportWorkspace(workspace: string, tokens: Readonly<Record<string, string | null>>, ttlMs: number): Promise<Done> {
        const refused = refusalOf(tokens, WORKSPACE_WRITABLE);
        return refused ?? this.ports.call(() => usePlugin((client) => client.call('workspace.report_metadata', { workspace_id: workspace, source: PLUGIN_ID, tokens, ttl_ms: ttlMs })));
    }

    async workspaces(): Promise<WorkspacesResult> {
        try {
            const found = list(parseJson(await usePlugin((client) => client.call('workspace.list', {})))['workspaces']);
            return { kind: 'workspaces', ids: found.map((entry) => str(entry['workspace_id'])).filter((id) => id !== '') };
        } catch (error) {
            return unknown({ why: 'unreachable', detail: causeOf(must(parseText(detail(error)))) });
        }
    }

    async notify(title: string, body: string): Promise<Notified> {
        return this.ports.notify(must(parseText(title)), must(parseText(body)));
    }

    async resize(pane: PaneId, direction: ResizeDirection, amount: number): Promise<Done> {
        const count = parseCount(amount);
        return count.kind === 'ok'
            ? this.ports.resize(pane, direction, count.value)
            : unknown({ why: 'unreadable', detail: causeOf(must(parseText(`resize amount ${amount} is not a count`))) });
    }

    async close(pane: PaneId): Promise<Done> {
        return this.ports.close(pane);
    }

    async closeEvery(): Promise<ClosedAll> {
        return this.ports.closeEvery();
    }
}
