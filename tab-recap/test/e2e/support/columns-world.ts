import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Method, PROTOCOL } from '@stateforge-labs/herdr-sdk';
import type { ReceivedRequest } from '@stateforge-labs/herdr-sdk/test-kit';
import { daemonWorld, type DaemonWorld } from './daemon-world.ts';

export const TAB = 'w1:t1';
export const COLUMN_PANE = 'w1:p9';

export interface Cells {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface PaneSpec {
    readonly id: string;
    readonly rect: Cells;
    readonly agent?: string;
    readonly title?: string;
    readonly label?: string;
    readonly tab?: string;
    readonly listOnly?: boolean;
}

export interface SplitSpec {
    readonly direction: 'right' | 'down';
    readonly ratio: number;
    readonly rect: Cells;
}

export interface TabSpec {
    readonly tab?: string;
    readonly area: Cells;
    readonly panes: readonly PaneSpec[];
    readonly splits: readonly SplitSpec[];
}

const rectOf = (cells: Cells): Cells => ({ x: cells.x, y: cells.y, width: cells.width, height: cells.height });

const infoOf = (spec: PaneSpec, tab: string): Record<string, unknown> => ({
    pane_id: spec.id,
    tab_id: spec.tab ?? tab,
    workspace_id: 'w1',
    agent_status: 'idle',
    focused: false,
    revision: 1,
    terminal_id: `term-${spec.id}`,
    cwd: '/work',
    foreground_cwd: '/work',
    terminal_title_stripped: spec.title ?? spec.id,
    ...(spec.label === undefined ? {} : { label: spec.label }),
    ...(spec.agent === undefined ? {} : { agent: spec.agent }),
});

const paneEntryOf = (spec: PaneSpec, tab: string): Record<string, unknown> => {
    const { agent: _agent, ...rest } = infoOf(spec, tab);
    return spec.listOnly === true ? rest : infoOf(spec, tab);
};

export function snapshotOf(tabs: readonly TabSpec[]): Record<string, unknown> {
    const specs = tabs.flatMap((spec) => spec.panes.map((pane) => ({ pane, tab: spec.tab ?? TAB })));
    return {
        type: 'session_snapshot',
        snapshot: {
            agents: specs.filter(({ pane }) => pane.agent !== undefined).map(({ pane, tab }) => infoOf(pane, tab)),
            layouts: tabs.map((spec) => ({
                tab_id: spec.tab ?? TAB,
                area: rectOf(spec.area),
                focused_pane_id: spec.panes[0]?.id ?? '',
                panes: spec.panes.map((pane) => ({ pane_id: pane.id, rect: rectOf(pane.rect) })),
                splits: spec.splits.map((split) => ({ direction: split.direction, ratio: split.ratio, rect: rectOf(split.rect) })),
            })),
            panes: specs.map(({ pane, tab }) => paneEntryOf(pane, tab)),
            protocol: PROTOCOL,
            tabs: [...new Set(specs.map(({ tab }) => tab))].map((tab) => ({ tab_id: tab, workspace_id: 'w1' })),
            version: '0',
            workspaces: [{ workspace_id: 'w1' }],
            focused_tab_id: tabs[0]?.tab ?? TAB,
        },
    };
}

export function sole<T>(items: readonly T[]): T {
    assert.equal(items.length, 1);
    const [item] = items;
    assert.ok(item !== undefined);
    return item;
}

export const MUTATING = ['pane.split', 'pane.swap', 'pane.move', 'pane.zoom', 'pane.close', 'pane.focus', 'pane.focus_direction', 'pane.rename', 'layout.apply', 'layout.set_split_ratio'];

export const paneOpened = (pane: string, tab: string = TAB): Record<string, unknown> => ({
    type: 'plugin_pane_opened',
    plugin_pane: {
        entrypoint: 'column',
        plugin_id: 'tab-recap',
        pane: { agent_status: 'idle', focused: false, pane_id: pane, revision: 1, tab_id: tab, terminal_id: `term-${pane}`, workspace_id: 'w1' },
    },
});

export interface ColumnsWorld {
    readonly world: DaemonWorld;
    show(...tabs: readonly TabSpec[]): void;
    showWhenOpened(...tabs: readonly TabSpec[]): void;
    requests(method: string): readonly ReceivedRequest[];
    started(): Promise<void>;
    opened(initial: readonly TabSpec[], afterOpen: readonly TabSpec[]): Promise<void>;
    configure(text: string): void;
    awaitRequest(method: string, count?: number): Promise<readonly ReceivedRequest[]>;
    quiet(): Promise<void>;
    close(): Promise<void>;
}

const settle = (): Promise<void> => new Promise((resolve) => { setImmediate(resolve); });
const nap = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

export async function columnsWorld(env: Readonly<Record<string, string>> = {}): Promise<ColumnsWorld> {
    const world = await daemonWorld({ env });
    world.herdr.reply(Method.PluginPaneOpen, paneOpened(COLUMN_PANE) as never);
    world.herdr.reply(Method.PaneResize, { type: 'ok' } as never);
    world.herdr.reply(Method.PaneClose, { type: 'ok' } as never);
    const state = { watching: true };

    const requests = (method: string): readonly ReceivedRequest[] => world.herdr.requests().filter((request) => request.method === method);

    const show = (...tabs: readonly TabSpec[]): void => {
        world.herdr.reply(Method.SessionSnapshot, snapshotOf(tabs) as never);
    };

    const showWhenOpened = (...tabs: readonly TabSpec[]): void => {
        void (async (): Promise<void> => {
            while (state.watching && requests('plugin.pane.open').length === 0) {
                await settle();
            }
            if (state.watching) {
                show(...tabs);
            }
        })();
    };

    const awaitRequest = async (method: string, count = 1): Promise<readonly ReceivedRequest[]> => {
        const deadline = Date.now() + 15_000;
        while (Date.now() < deadline) {
            const found = requests(method);
            if (found.length >= count) {
                return found;
            }
            await nap(25);
        }
        throw new Error(`timed out: no ${method} request (${count}); the daemon log ends: ${world.log().slice(-600)}`);
    };

    const started = async (): Promise<void> => {
        world.daemon();
        await world.awaitLog(/daemon \d+ up, state in \S+/);
    };

    return {
        world,
        show,
        showWhenOpened,
        requests,
        awaitRequest,
        started,
        opened: async (initial, afterOpen) => {
            show(...initial);
            showWhenOpened(...afterOpen);
            await started();
            await world.awaitLog(/column opened \(/);
        },
        configure: (text) => { writeFileSync(join(world.configDir, 'config.env'), text); },
        quiet: () => nap(1_500),
        close: async () => {
            state.watching = false;
            await world.close();
        },
    };
}
