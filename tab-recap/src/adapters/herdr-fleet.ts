import { agentPanesIn, columnsIn } from './column-panes.ts';
import { HerdrAgents } from './herdr-agents.ts';
import { HerdrError, rpc, subscribe } from '#src/transport/herdr.ts';
import type { Json, Pushed } from '#src/transport/herdr.ts';
import { AsyncQueue } from '#src/recap/application/async-queue.ts';
import { sessionOf } from '#src/recap/application/decode.ts';
import { sessionOfForKind } from './session-registry.ts';
import type { Shape } from '#src/recap/domain/board.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { ClosedAll, Columns, Done, LayoutResult, OpenResult } from '#src/ports/columns.ts';
import type { Harnesses, HarnessesResult } from '#src/ports/harnesses.ts';
import type { ModalHost, SetupOpened } from '#src/ports/modal.ts';
import type { Notified, Notifier } from '#src/ports/notifier.ts';
import type { ScreenResult, Screens } from '#src/ports/screens.ts';
import type { FleetSource, Frame, SnapshotResult, StreamResult, Topic } from '#src/ports/fleet-source.ts';
import { unknown } from '#src/ports/unknowable.ts';
import type { Unknown } from '#src/ports/unknowable.ts';
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import { PANE_WRITABLE, WORKSPACE_WRITABLE } from '#src/recap/domain/lane-tokens.ts';
import { refusalOf } from './token-refusal.ts';
import { layoutOf, list, reconciliationOf, str } from './herdr-json.ts';
import type { PaneTokens, PaneTokensResult } from '#src/ports/pane-tokens.ts';
import type { WorkspaceTokens, WorkspacesResult } from '#src/ports/workspace-tokens.ts';

export { BAR_TITLE, COLUMN_TITLE } from './column-panes.ts';
export const PLUGIN_ID = 'tab-recap';
export const COLUMN_ENTRYPOINT = 'column';
export const SETUP_ENTRYPOINT = 'setup';

const detail = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const MODAL_SIZE = '96%';

export async function readPaneTokens(pane: string): Promise<PaneTokensResult> {
    try {
        const info = (await rpc('pane.get', { pane_id: pane }))['pane'];
        const tokens = typeof info === 'object' && info !== null ? (info as Json)['tokens'] : undefined;
        return { kind: 'tokens', tokens: typeof tokens === 'object' && tokens !== null ? Object.fromEntries(Object.entries(tokens).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) : {} };
    } catch (error) {
        return unknown({ why: 'unreachable', detail: detail(error) });
    }
}

export async function readPaneSession(pane: string): Promise<string | null | Unknown> {
    try {
        const info = (await rpc('pane.get', { pane_id: pane }))['pane'];
        return typeof info === 'object' && info !== null ? sessionOf(info as Record<string, unknown>, sessionOfForKind) : null;
    } catch (error) {
        return unknown({ why: 'unreachable', detail: detail(error) });
    }
}

export class HerdrFleet implements FleetSource, Columns, ModalHost, Harnesses, Notifier, Screens, LaneTokens, PaneTokens, WorkspaceTokens {
    private readonly stateDir: string;

    constructor(stateDir: string) {
        this.stateDir = stateDir;
    }

    agents(): HerdrAgents {
        return new HerdrAgents(rpc, { id: PLUGIN_ID, stateDir: this.stateDir });
    }

    private async rawSnapshot(): Promise<Json> {
        const result = await rpc('session.snapshot', {});
        const snap = result['snapshot'];
        return typeof snap === 'object' && snap !== null ? (snap as Json) : {};
    }

    async snapshot(): Promise<SnapshotResult> {
        try {
            const snap = await this.rawSnapshot();
            const focused = str(snap['focused_tab_id']);
            return { kind: 'snapshot', seen: reconciliationOf(snap), focusedTab: focused === '' ? null : focused };
        } catch (error) {
            return unknown({ why: 'unreachable', detail: detail(error) });
        }
    }

    async subscribe(topics: readonly Topic[]): Promise<StreamResult> {
        const queue = new AsyncQueue<Frame>();
        try {
            const live = await subscribe(topics.map((topic) => ({ ...topic })), (pushed: Pushed) => { queue.push(pushed); }, () => { queue.end(); });
            return { kind: 'stream', stream: { frames: (): AsyncIterable<Frame> => queue, close: (): void => { live.close(); queue.end(); } } };
        } catch (error) {
            return unknown({ why: 'unreachable', detail: detail(error) });
        }
    }

    async layout(tab: TabId): Promise<LayoutResult> {
        try {
            const layout = list((await this.rawSnapshot())['layouts']).find((candidate) => candidate['tab_id'] === String(tab));
            return layout === undefined ? unknown({ why: 'not-found', what: `the layout of ${tab}` }) : layoutOf(layout);
        } catch (error) {
            return unknown({ why: 'unreachable', detail: detail(error) });
        }
    }

    async open(tab: TabId, target: string, shape: Shape): Promise<OpenResult> {
        try {
            const result = await rpc('plugin.pane.open', {
                plugin_id: PLUGIN_ID,
                entrypoint: COLUMN_ENTRYPOINT,
                placement: 'split',
                direction: shape === 'side' ? 'right' : 'down',
                target_pane_id: target,
                focus: false,
                env: { TAB_RECAP_TAB: String(tab), TAB_RECAP_STATE: this.stateDir, TAB_RECAP_SHAPE: shape },
            });
            const info = typeof result['plugin_pane'] === 'object' && result['plugin_pane'] !== null ? (result['plugin_pane'] as Json) : {};
            const pane = typeof info['pane'] === 'object' && info['pane'] !== null ? str((info['pane'] as Json)['pane_id']) : '';
            return pane === '' ? unknown({ why: 'unreadable', detail: 'plugin.pane.open returned no pane' }) : { kind: 'opened', pane: paneId(pane) };
        } catch (error) {
            return unknown({ why: 'unreachable', detail: detail(error) });
        }
    }

    async show(tab: TabId): Promise<Done> {
        return this.call('plugin.pane.open', {
            plugin_id: PLUGIN_ID,
            entrypoint: COLUMN_ENTRYPOINT,
            placement: 'popup',
            width: MODAL_SIZE,
            height: MODAL_SIZE,
            focus: true,
            env: { TAB_RECAP_TAB: String(tab), TAB_RECAP_STATE: this.stateDir, TAB_RECAP_MODE: 'modal' },
        });
    }

    async setup(tab: TabId | null): Promise<SetupOpened> {
        try {
            await rpc('plugin.pane.open', {
                plugin_id: PLUGIN_ID,
                entrypoint: SETUP_ENTRYPOINT,
                placement: 'popup',
                width: MODAL_SIZE,
                height: MODAL_SIZE,
                focus: true,
                env: { TAB_RECAP_TAB: tab === null ? '' : String(tab), TAB_RECAP_STATE: this.stateDir },
            });
            return { kind: 'opened' };
        } catch (error) {
            return error instanceof HerdrError && error.code === 'ui_busy' ? { kind: 'busy' } : unknown({ why: 'unreachable', detail: detail(error) });
        }
    }

    async available(): Promise<HarnessesResult> {
        try {
            const ids = list((await rpc('integration.list', {}))['integrations'])
                .filter((entry) => entry['available'] === true)
                .map((entry) => str(entry['target']));
            return { kind: 'available', ids };
        } catch (error) {
            return unknown({ why: 'unreachable', detail: detail(error) });
        }
    }

    async readScreen(pane: string, lines: number): Promise<ScreenResult> {
        try {
            const read = (await rpc('pane.read', { pane_id: pane, source: 'recent_unwrapped', lines, format: 'text' }))['read'];
            const fields = typeof read === 'object' && read !== null ? (read as Json) : {};
            return typeof fields['text'] === 'string'
                ? { kind: 'screen', text: fields['text'], revision: typeof fields['revision'] === 'number' ? fields['revision'] : 0, truncated: fields['truncated'] === true }
                : unknown({ why: 'unreadable', detail: `pane.read of ${pane} returned no text` });
        } catch (error) {
            return unknown({ why: 'unreachable', detail: detail(error) });
        }
    }

    async report(pane: string, tokens: Readonly<Record<string, string | null>>, ttlMs: number): Promise<Done> {
        const refused = refusalOf(tokens, PANE_WRITABLE);
        return refused ?? this.call('pane.report_metadata', { pane_id: pane, source: PLUGIN_ID, tokens, ttl_ms: ttlMs });
    }

    async read(pane: string): Promise<PaneTokensResult> {
        return readPaneTokens(pane);
    }

    async reportWorkspace(workspace: string, tokens: Readonly<Record<string, string | null>>, ttlMs: number): Promise<Done> {
        const refused = refusalOf(tokens, WORKSPACE_WRITABLE);
        return refused ?? this.call('workspace.report_metadata', { workspace_id: workspace, source: PLUGIN_ID, tokens, ttl_ms: ttlMs });
    }

    async workspaces(): Promise<WorkspacesResult> {
        try {
            const found = list((await rpc('workspace.list', {}))['workspaces']);
            return { kind: 'workspaces', ids: found.map((entry) => str(entry['workspace_id'])).filter((id) => id !== '') };
        } catch (error) {
            return unknown({ why: 'unreachable', detail: detail(error) });
        }
    }

    async notify(title: string, body: string): Promise<Notified> {
        const done = await this.call('notification.show', { title, body });
        return done.kind === 'done' ? { kind: 'shown' } : done;
    }

    private async refuseAgent(verb: string, pane: string): Promise<Done | null> {
        try {
            const snapshot = await this.rawSnapshot();
            const panes = list(snapshot['panes']);
            if (!agentPanesIn(panes, list(snapshot['agents'])).has(pane)) {
                return null;
            }
            const why = `refused: ${verb} ${pane} — it hosts an agent`;
            process.stderr.write(`${new Date().toISOString()} ${why}\n`);
            return unknown({ why: 'failed', code: 1, detail: why });
        } catch (error) {
            return unknown({ why: 'unreachable', detail: `refused: ${verb} ${pane} — could not check it hosts no agent (${detail(error)})` });
        }
    }

    private async guarded(verb: string, pane: string, method: string, params: Json): Promise<Done> {
        return (await this.refuseAgent(verb, pane)) ?? this.call(method, params);
    }

    async resize(pane: PaneId, direction: 'left' | 'right' | 'up' | 'down', amount: number): Promise<Done> {
        return this.guarded('resize', String(pane), 'pane.resize', { pane_id: String(pane), direction, amount });
    }

    async close(pane: PaneId): Promise<Done> {
        return this.guarded('close', String(pane), 'pane.close', { pane_id: String(pane) });
    }

    async closeEvery(): Promise<ClosedAll> {
        try {
            const snapshot = await this.rawSnapshot();
            const panes = list(snapshot['panes']);
            let closed = 0;
            let failed = 0;
            for (const column of columnsIn(panes, agentPanesIn(panes, list(snapshot['agents'])))) {
                const done = await this.call('pane.close', { pane_id: column.paneId });
                closed += done.kind === 'done' ? 1 : 0;
                failed += done.kind === 'done' ? 0 : 1;
            }
            return { kind: 'closed', closed, failed };
        } catch (error) {
            return unknown({ why: 'unreachable', detail: detail(error) });
        }
    }

    private async call(method: string, params: Json): Promise<Done> {
        try {
            await rpc(method, params);
            return { kind: 'done' };
        } catch (error) {
            return unknown({ why: 'unreachable', detail: detail(error) });
        }
    }
}
