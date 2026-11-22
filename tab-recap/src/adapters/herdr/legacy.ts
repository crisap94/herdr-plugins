import { setTimeout as sleep } from 'node:timers/promises';
import type { DecodedFrame } from '@stateforge-labs/herdr-sdk';
import type { Agents, AgentState, LineBehavior, PromptBehavior, PromptWait, Prompted, PromptStance, PromptWaitFor } from '#src/ports/agents.ts';
import type { ClosedAll, Columns, Done, LayoutResult, OpenResult, ResizeDirection } from '#src/ports/columns.ts';
import type { HarnessDirectory, HarnessList } from '#src/ports/harnesses.ts';
import type { ModalHost, SetupOpened } from '#src/ports/modal.ts';
import type { Notice, NotifierPort } from '#src/ports/notifier.ts';
import type { ScreenOutcome, ScreenReader } from '#src/ports/screens.ts';
import type { Frame, FleetSource, SnapshotResult, StreamResult, Topic } from '#src/ports/fleet-source.ts';
import type { LaneTokenMap, LaneTokens } from '#src/ports/lane-tokens.ts';
import { uncheckedTokenName, uncheckedTokenValue } from '#src/protocol/primitives.ts';
import type { PaneTokens, PaneTokensResult } from '#src/ports/pane-tokens.ts';
import type { WorkspaceList, WorkspaceTokenMap, WorkspaceTokenReporter } from '#src/ports/workspace-tokens.ts';
import { unknown, type Unknown } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import type { TokenMap } from '#src/protocol/tokens.ts';
import { causeOf } from '#src/recap/domain/failure-cause.ts';
import { countOf, parseCount, type Count } from '#src/recap/domain/count.ts';
import { uncheckedPaneId, uncheckedRatio } from '#src/recap/domain/ids.ts';
import type { CompactionLine } from '#src/recap/domain/compaction-plan.ts';
import type { Shape } from '#src/recap/domain/board.ts';
import type { Reconciliation } from '#src/recap/domain/fold.ts';
import { agentKind, parsePaneId, parseTabId, tabId, type PaneId, type TabId, type WorkspaceId } from '#src/recap/domain/ids.ts';
import type { Placed, Split } from '#src/recap/domain/layout.ts';
import type { SeenLane } from '#src/recap/domain/lane.ts';
import { parseText, textOf, type Text } from '#src/recap/domain/text.ts';
import { parseMilliseconds, type Milliseconds } from '#src/recap/domain/time.ts';
import { AsyncQueue } from '#src/recap/application/async-queue.ts';
import { paneTokenMapOf, seenFrom, sessionOf } from '#src/recap/application/decode.ts';
import { agentPanesIn, columnsIn, deadColumnsIn } from './column-panes.ts';
import { HerdrAgentPanes, herdrWire, type Pause, type PluginRef, type Wire } from './agents.ts';
import { usePlugin } from './client.ts';
import { HerdrFleetPorts, PLUGIN_ID, pumpFrames } from './fleet.ts';
import { subscribeTopics } from './subscriptions.ts';
import { sessionOfForKind } from './session-registry.ts';
import { parseJson, parseJsonList, parseJsonRect, parseJsonText, type Json } from './json-object.ts';

export function reconciliationOf(snapshot: Json): Reconciliation {
    const panes = parseJsonList(snapshot['panes']);
    const agents = agentPanesIn(panes, parseJsonList(snapshot['agents']));
    const lanes = parseJsonList(snapshot['agents']).map((agent) => seenFrom(agent, sessionOfForKind)).filter((lane): lane is SeenLane => lane !== null);
    const widths = new Map(parseJsonList(snapshot['layouts']).map((layout) => [parseJsonText(layout['tab_id']), parseJsonRect(layout['area']).width]));
    const focused = parseJsonText(snapshot['focused_tab_id']);
    const tabs = Array.isArray(snapshot['tabs']) ? { tabs: parseJsonList(snapshot['tabs']).map((tab) => parseJsonText(tab['tab_id'])).filter((tab) => tab !== '').map((tab) => tabId(tab)) } : {};
    return { focusedTab: focused === '' ? null : focused, lanes, panes: panes.map((pane) => parseJsonText(pane['pane_id'])), columns: columnsIn(panes, agents), dead: deadColumnsIn(panes, agents), widths, ...tabs };
}

export function paneTokensOf(snapshot: Json): ReadonlyMap<PaneId, TokenMap> {
    return new Map(parseJsonList(snapshot['panes']).flatMap((pane) => {
        const found = paneTokenMapOf(pane);
        return found === null ? [] : [[found.pane, Object.fromEntries(found.tokens)] as const];
    }));
}

export function layoutOf(layout: Json): LayoutResult {
    const panes: Placed[] = parseJsonList(layout['panes']).map((pane) => ({ paneId: uncheckedPaneId(parseJsonText(pane['pane_id'])), rect: parseJsonRect(pane['rect']) }));
    const splits: Split[] = parseJsonList(layout['splits']).map((split) => ({
        direction: textOf(parseJsonText(split['direction'])),
        ratio: uncheckedRatio(typeof split['ratio'] === 'number' ? split['ratio'] : 0.5),
        rect: parseJsonRect(split['rect']),
    }));
    const area = parseJsonRect(layout['area']);
    const focused = parseJsonText(layout['focused_pane_id']);
    return { kind: 'layout', width: area.width, height: area.height, focused: focused === '' ? null : focused, panes, splits };
}

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
        return unknown({ why: 'unreachable', detail: causeOf(must(parseText(error instanceof Error ? error.message : String(error)))) });
    }
}

export class HerdrAgents implements Agents {
    private readonly panes: HerdrAgentPanes;

    constructor(wire: Wire, plugin: PluginRef, pause: Pause = (wait) => sleep(Number(wait))) {
        this.panes = new HerdrAgentPanes(wire, plugin, pause);
    }

    async status(pane: string): Promise<AgentState> {
        const id = paneOf(pane);
        return id === null ? unknown({ why: 'not-found', what: textOf(`agent ${pane}`) }) : this.panes.status(id);
    }

    async prompt(pane: string, text: string, wait: PromptWait | undefined, behavior: PromptBehavior): Promise<Prompted> {
        const id = paneOf(pane);
        const body = parseText(text);
        if (id === null) {
            return unknown({ why: 'not-found', what: textOf(`agent ${pane}`) });
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
        return id === null ? unknown({ why: 'not-found', what: textOf(`agent ${pane}`) }) : this.panes.typeLine(id, line, behavior);
    }

    async askNote(tab: string, pane: string | null): Promise<Done> {
        const tabIdentity = tabOf(tab);
        const paneIdentity = pane === null ? null : paneOf(pane);
        if (tabIdentity === null || (pane !== null && paneIdentity === null)) {
            return unknown({ why: 'not-found', what: textOf(`tab ${tab}`) });
        }
        return this.panes.askNote(tabIdentity, paneIdentity);
    }
}

export class HerdrFleet implements FleetSource, Columns, ModalHost, HarnessDirectory, NotifierPort, ScreenReader, LaneTokens, PaneTokens, WorkspaceTokenReporter {
    private readonly stateDir: Text;
    private readonly ports: HerdrFleetPorts;

    constructor(stateDir: Text) {
        this.stateDir = stateDir;
        this.ports = new HerdrFleetPorts(stateDir);
    }

    agents(): HerdrAgents {
        return new HerdrAgents(herdrWire, { id: must(parseText(PLUGIN_ID)), stateDir: this.stateDir });
    }

    async snapshot(): Promise<SnapshotResult> {
        try {
            const snap = await this.ports.rawSnapshot();
            const focused = parseJsonText(snap['focused_tab_id']);
            return { kind: 'snapshot', seen: reconciliationOf(snap), focusedTab: focused === '' ? null : focused, paneTokens: paneTokensOf(snap) };
        } catch (error) {
            return unknown({ why: 'unreachable', detail: causeOf(must(parseText(error instanceof Error ? error.message : String(error)))) });
        }
    }

    async subscribe(topics: readonly Topic[]): Promise<StreamResult> {
        const queue = new AsyncQueue<Frame>();
        try {
            const live = await subscribeTopics(topics);
            pumpFrames(live, queue, legacyFrameOf);
            return { kind: 'stream', stream: { frames: (): AsyncIterable<Frame> => queue, close: (): void => { live.close(); queue.end(); } } };
        } catch (error) {
            return unknown({ why: 'unreachable', detail: causeOf(must(parseText(error instanceof Error ? error.message : String(error)))) });
        }
    }

    async layout(tab: TabId): Promise<LayoutResult> {
        try {
            const layout = parseJsonList((await this.ports.rawSnapshot())['layouts']).find((candidate) => candidate['tab_id'] === String(tab));
            return layout === undefined ? unknown({ why: 'not-found', what: textOf(`the layout of ${tab}`) }) : layoutOf(layout);
        } catch (error) {
            return unknown({ why: 'unreachable', detail: causeOf(must(parseText(error instanceof Error ? error.message : String(error)))) });
        }
    }

    async open(tab: TabId, target: Text, shape: Shape): Promise<OpenResult> {
        return this.ports.open(tab, target, shape);
    }

    async show(tab: TabId): Promise<Done> {
        return this.ports.show(tab);
    }

    async setup(tab: TabId | null): Promise<SetupOpened> {
        return this.ports.setup(tab);
    }

    async available(): Promise<HarnessList> {
        try {
            const ids = parseJsonList(parseJson(await usePlugin((client) => client.call('integration.list', {})))['integrations'])
                .filter((entry) => entry['available'] === true)
                .map((entry) => agentKind(parseJsonText(entry['target'])));
            return { kind: 'available', ids };
        } catch (error) {
            return unknown({ why: 'unreachable', detail: causeOf(must(parseText(error instanceof Error ? error.message : String(error)))) });
        }
    }

    async readScreen(pane: PaneId, lines: Count): Promise<ScreenOutcome> {
        try {
            const fields = parseJson(parseJson(await usePlugin((client) => client.call('pane.read', { pane_id: pane, source: 'recent_unwrapped', lines, format: 'text' })))['read']);
            return typeof fields['text'] === 'string'
                ? { kind: 'screen', text: textOf(fields['text']), revision: countOf(typeof fields['revision'] === 'number' ? fields['revision'] : 0), truncated: fields['truncated'] === true ? 'present' : 'absent' }
                : unknown({ why: 'unreadable', detail: causeOf(must(parseText(`pane.read of ${pane} returned no text`))) });
        } catch (error) {
            return unknown({ why: 'unreachable', detail: causeOf(must(parseText(error instanceof Error ? error.message : String(error)))) });
        }
    }

    async report(pane: string, tokens: Readonly<Record<string, string | null>>, ttlMs: number): Promise<Done> {
        const named: LaneTokenMap = new Map(Object.entries(tokens).map(([name, value]) => [uncheckedTokenName(name), value === null ? null : uncheckedTokenValue(value)]));
        return this.ports.report(uncheckedPaneId(pane), named, must(parseMilliseconds(ttlMs)));
    }

    async read(pane: PaneId): Promise<PaneTokensResult> {
        return this.ports.read(pane);
    }

    async reportWorkspace(workspace: WorkspaceId, tokens: WorkspaceTokenMap, ttlMs: Milliseconds): Promise<Done> {
        return this.ports.reportWorkspace(workspace, tokens, ttlMs);
    }

    async workspaces(): Promise<WorkspaceList> {
        return this.ports.workspaces();
    }

    async notify(title: Text, body: Text): Promise<Notice> {
        return this.ports.notify(title, body);
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
