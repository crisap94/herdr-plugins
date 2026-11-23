import { HerdrError } from '@stateforge-labs/herdr-sdk';
import type { DecodedFrame, EventSubscription } from '@stateforge-labs/herdr-sdk';
import { AsyncQueue } from '#src/recap/application/async-queue.ts';
import { usePlugin, useAdmin } from './client.ts';
import { subscribeTopics } from './subscriptions.ts';
import { agentPanesIn, columnsIn, deadColumnsIn, parseOptionalPaneId } from './column-panes.ts';
import { parseJsonList, parseJsonRect, parseJsonText } from './json.ts';
import { paneTokensOf, readPaneTokens, reconciliationOf } from './snapshot-reading.ts';
import { parseJson, type JsonObject } from './json-object.ts';
import { refusalOfTokens } from './token-refusal.ts';
import { HerdrAgentPanes, herdrWire } from './agents.ts';
import { OWNERS } from '#src/recap/domain/token-registry.ts';
import { parseAgentKind, parseTabId, uncheckedPaneId, uncheckedRatio, uncheckedWorkspaceId, type PaneId, type TabId, type WorkspaceId } from '#src/recap/domain/ids.ts';
import type { Probability } from '#src/recap/domain/probability.ts';
import { countOf, parseCount, type Count } from '#src/recap/domain/count.ts';
import { parseText, type Text, textOf } from '#src/recap/domain/text.ts';
import type { Milliseconds } from '#src/recap/domain/time.ts';
import type { Shape } from '#src/recap/domain/board.ts';
import { causeOf } from '#src/recap/domain/failure-cause.ts';
import { parseTokenName, type TokenName } from '#src/protocol/primitives.ts';
import { EVENT_TOKEN } from '#src/recap/domain/event-token.ts';
import { must } from '#src/protocol/result.ts';
import { unknown, exitCodeOf } from '#src/ports/unknowable.ts';
import type { ScreenOutcome, ScreenReader } from '#src/ports/screens.ts';
import type { ColumnLayoutResult, ClosedEvery, ColumnPanes, Done, OpenResult, ResizeDirection } from '#src/ports/columns.ts';
import type { FleetFeed, FleetFrame, FleetSnapshotResult, FleetStreamResult, FleetTopic } from '#src/ports/fleet-source.ts';
import type { HarnessDirectory, HarnessList } from '#src/ports/harnesses.ts';
import type { LaneTokenMap, LaneTokenReporter } from '#src/ports/lane-tokens.ts';
import type { ModalHost, SetupOpened } from '#src/ports/modal.ts';
import type { Notice, NotifierPort } from '#src/ports/notifier.ts';
import type { PaneTokens, PaneTokensResult } from '#src/ports/pane-tokens.ts';
import type { WorkspaceList, WorkspaceTokenMap, WorkspaceTokenReporter } from '#src/ports/workspace-tokens.ts';

export { BAR_TITLE, COLUMN_TITLE } from './column-panes.ts';
export const PLUGIN_ID = 'tab-recap';
export const COLUMN_ENTRYPOINT = 'column';
export const SETUP_ENTRYPOINT = 'setup';

const MODAL_SIZE = '96%';
const WORKSPACE_WRITABLE: readonly TokenName[] = [must(parseTokenName(EVENT_TOKEN))];
const RESIZE = must(parseText('resize'));
const CLOSE = must(parseText('close'));

const parseOptionalTabId = (input: unknown): TabId | null => { const found = parseTabId(input); return found.kind === 'ok' ? found.value : null; };

const frameOf = (frame: DecodedFrame): FleetFrame => ({
    event: must(parseText(frame.event)),
    payload: must(parseText(JSON.stringify('data' in frame ? parseJson(frame.data) : {}))),
});

export function pumpFrames<T>(live: EventSubscription, queue: AsyncQueue<T>, toItem: (frame: DecodedFrame) => T): void {
    (async (): Promise<void> => {
        for await (const frame of live) {
            queue.push(toItem(frame));
        }
    })().catch(() => undefined).finally(() => { queue.end(); });
}

export class HerdrFleetPorts implements FleetFeed, ColumnPanes, ModalHost, HarnessDirectory, NotifierPort, LaneTokenReporter, PaneTokens, ScreenReader, WorkspaceTokenReporter {
    private readonly stateDir: Text;

    constructor(stateDir: Text) {
        this.stateDir = stateDir;
    }

    agents(): HerdrAgentPanes {
        return new HerdrAgentPanes(herdrWire, { id: must(parseText(PLUGIN_ID)), stateDir: this.stateDir });
    }

    async rawSnapshot(): Promise<JsonObject> {
        return parseJson(parseJson(await usePlugin((client) => client.call('session.snapshot', {})))['snapshot']);
    }

    async snapshot(): Promise<FleetSnapshotResult> {
        try {
            const snap = await this.rawSnapshot();
            return { kind: 'snapshot', seen: reconciliationOf(snap), focusedTab: parseOptionalTabId(parseJsonText(snap['focused_tab_id'])), paneTokens: paneTokensOf(snap) };
        } catch (error) {
            return unknown({ why: 'unreachable', detail: causeOf(must(parseText(error instanceof Error ? error.message : String(error)))) });
        }
    }

    async subscribe(topics: readonly FleetTopic[]): Promise<FleetStreamResult> {
        const queue = new AsyncQueue<FleetFrame>();
        try {
            const live = await subscribeTopics(topics);
            pumpFrames(live, queue, frameOf);
            return { kind: 'stream', stream: { frames: (): AsyncIterable<FleetFrame> => queue, close: (): void => { live.close(); queue.end(); } } };
        } catch (error) {
            return unknown({ why: 'unreachable', detail: causeOf(must(parseText(error instanceof Error ? error.message : String(error)))) });
        }
    }

    async layout(tab: TabId): Promise<ColumnLayoutResult> {
        try {
            const found = parseJsonList((await this.rawSnapshot())['layouts']).find((candidate) => candidate['tab_id'] === String(tab));
            if (found === undefined) {
                return unknown({ why: 'not-found', what: textOf(`the layout of ${tab}`) });
            }
            const area = parseJsonRect(found['area']);
            const width = parseCount(area.width);
            const height = parseCount(area.height);
            if (width.kind !== 'ok' || height.kind !== 'ok') {
                return unknown({ why: 'unreadable', detail: causeOf(must(parseText(`the layout of ${tab} has no size`))) });
            }
            return {
                kind: 'layout',
                width: width.value,
                height: height.value,
                focused: parseOptionalPaneId(parseJsonText(found['focused_pane_id'])),
                panes: parseJsonList(found['panes']).map((pane) => ({ paneId: uncheckedPaneId(parseJsonText(pane['pane_id'])), rect: parseJsonRect(pane['rect']) })),
                splits: parseJsonList(found['splits']).map((split) => ({ direction: textOf(parseJsonText(split['direction'])), ratio: uncheckedRatio(typeof split['ratio'] === 'number' ? split['ratio'] : 0.5), rect: parseJsonRect(split['rect']) })),
            };
        } catch (error) {
            return unknown({ why: 'unreachable', detail: causeOf(must(parseText(error instanceof Error ? error.message : String(error)))) });
        }
    }

    async open(tab: TabId, target: Text, shape: Shape): Promise<OpenResult> {
        try {
            const result = parseJson(await usePlugin((client) => client.call('plugin.pane.open', {
                plugin_id: PLUGIN_ID,
                entrypoint: COLUMN_ENTRYPOINT,
                placement: 'split',
                direction: shape === 'side' ? 'right' : 'down',
                target_pane_id: target,
                focus: false,
                env: { TAB_RECAP_TAB: String(tab), TAB_RECAP_STATE: this.stateDir, TAB_RECAP_SHAPE: shape },
            })));
            const pane = parseOptionalPaneId(parseJson(parseJson(result['plugin_pane'])['pane'])['pane_id']);
            return pane === null ? unknown({ why: 'unreadable', detail: causeOf(must(parseText('plugin.pane.open returned no pane'))) }) : { kind: 'opened', pane };
        } catch (error) {
            return unknown({ why: 'unreachable', detail: causeOf(must(parseText(error instanceof Error ? error.message : String(error)))) });
        }
    }

    async show(tab: TabId): Promise<Done> {
        return this.call(() => usePlugin((client) => client.call('plugin.pane.open', {
            plugin_id: PLUGIN_ID,
            entrypoint: COLUMN_ENTRYPOINT,
            placement: 'popup',
            width: MODAL_SIZE,
            height: MODAL_SIZE,
            focus: true,
            env: { TAB_RECAP_TAB: String(tab), TAB_RECAP_STATE: this.stateDir, TAB_RECAP_MODE: 'modal' },
        })));
    }

    async setup(tab: TabId | null): Promise<SetupOpened> {
        try {
            await usePlugin((client) => client.call('plugin.pane.open', {
                plugin_id: PLUGIN_ID,
                entrypoint: SETUP_ENTRYPOINT,
                placement: 'popup',
                width: MODAL_SIZE,
                height: MODAL_SIZE,
                focus: true,
                env: { TAB_RECAP_TAB: tab === null ? '' : String(tab), TAB_RECAP_STATE: this.stateDir },
            }));
            return { kind: 'opened' };
        } catch (error) {
            return error instanceof HerdrError && error.code === 'ui_busy' ? { kind: 'busy' } : unknown({ why: 'unreachable', detail: causeOf(must(parseText(error instanceof Error ? error.message : String(error)))) });
        }
    }

    async available(): Promise<HarnessList> {
        try {
            const ids = parseJsonList(parseJson(await usePlugin((client) => client.call('integration.list', {})))['integrations'])
                .filter((entry) => entry['available'] === true)
                .flatMap((entry) => {
                    const found = parseAgentKind(entry['target']);
                    return found.kind === 'ok' ? [found.value] : [];
                });
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

    async report(pane: PaneId, tokens: LaneTokenMap, ttlMs: Milliseconds): Promise<Done> {
        const record = Object.fromEntries(tokens);
        const refused = refusalOfTokens(tokens, OWNERS.writable);
        return refused ?? this.call(() => usePlugin((client) => client.call('pane.report_metadata', { pane_id: pane, source: PLUGIN_ID, tokens: record, ttl_ms: Number(ttlMs) })));
    }

    async read(pane: PaneId): Promise<PaneTokensResult> {
        return readPaneTokens(pane);
    }

    async reportWorkspace(workspace: WorkspaceId, tokens: WorkspaceTokenMap, ttlMs: Milliseconds): Promise<Done> {
        const refused = refusalOfTokens(tokens, WORKSPACE_WRITABLE);
        return refused ?? this.call(() => usePlugin((client) => client.call('workspace.report_metadata', { workspace_id: workspace, source: PLUGIN_ID, tokens: Object.fromEntries(tokens), ttl_ms: Number(ttlMs) })));
    }

    async workspaces(): Promise<WorkspaceList> {
        try {
            const found = parseJsonList(parseJson(await usePlugin((client) => client.call('workspace.list', {})))['workspaces']);
            return { kind: 'workspaces', ids: found.map((entry) => parseJsonText(entry['workspace_id'])).filter((id) => id !== '').map((id) => uncheckedWorkspaceId(id)) };
        } catch (error) {
            return unknown({ why: 'unreachable', detail: causeOf(must(parseText(error instanceof Error ? error.message : String(error)))) });
        }
    }

    async notify(title: Text, body: Text): Promise<Notice> {
        const done = await this.call(() => usePlugin((client) => client.call('notification.show', { title, body })));
        return done.kind === 'done' ? { kind: 'shown' } : done;
    }

    async resize(pane: PaneId, direction: ResizeDirection, amount: Probability): Promise<Done> {
        return this.guarded(RESIZE, pane, () => usePlugin((client) => client.call('pane.resize', { pane_id: String(pane), direction, amount })));
    }

    async close(pane: PaneId): Promise<Done> {
        return this.guarded(CLOSE, pane, () => useAdmin((client) => client.call('pane.close', { pane_id: String(pane) })));
    }

    async closeEvery(): Promise<ClosedEvery> {
        try {
            const snapshot = await this.rawSnapshot();
            const panes = parseJsonList(snapshot['panes']);
            let closed = 0;
            let failed = 0;
            const agentPanes = agentPanesIn(panes, parseJsonList(snapshot['agents']));
            for (const target of [...columnsIn(panes, agentPanes).map((column) => column.paneId), ...deadColumnsIn(panes, agentPanes).map((dead) => String(dead.pane))]) {
                const done = await this.call(() => useAdmin((client) => client.call('pane.close', { pane_id: target })));
                closed += done.kind === 'done' ? 1 : 0;
                failed += done.kind === 'done' ? 0 : 1;
            }
            return { kind: 'closed', closed: must(parseCount(closed)), failed: must(parseCount(failed)) };
        } catch (error) {
            return unknown({ why: 'unreachable', detail: causeOf(must(parseText(error instanceof Error ? error.message : String(error)))) });
        }
    }

    async call<T>(run: () => Promise<T>): Promise<Done> {
        try {
            await run();
            return { kind: 'done' };
        } catch (error) {
            return unknown({ why: 'unreachable', detail: causeOf(must(parseText(error instanceof Error ? error.message : String(error)))) });
        }
    }

    private async refuseAgent(verb: Text, pane: PaneId): Promise<Done | null> {
        try {
            const snapshot = await this.rawSnapshot();
            if (!agentPanesIn(parseJsonList(snapshot['panes']), parseJsonList(snapshot['agents'])).has(pane)) {
                return null;
            }
            const why = `refused: ${verb} ${pane} — it hosts an agent`;
            process.stderr.write(`${new Date().toISOString()} ${why}\n`);
            return unknown({ why: 'failed', code: exitCodeOf(1), detail: causeOf(must(parseText(why))) });
        } catch (error) {
            return unknown({ why: 'unreachable', detail: causeOf(must(parseText(`refused: ${verb} ${pane} — could not check it hosts no agent (${error instanceof Error ? error.message : String(error)})`))) });
        }
    }

    private async guarded<T>(verb: Text, pane: PaneId, run: () => Promise<T>): Promise<Done> {
        return (await this.refuseAgent(verb, pane)) ?? this.call(run);
    }
}
