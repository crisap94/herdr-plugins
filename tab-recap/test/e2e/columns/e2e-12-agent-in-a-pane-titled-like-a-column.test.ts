import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { columnsWorld, COLUMN_PANE, MUTATING, sole, type Cells, type ColumnsWorld, type PaneSpec, type TabSpec } from '../support/columns-world.ts';

interface Opened {
    readonly target_pane_id: string;
    readonly env: Readonly<Record<string, string>>;
}

interface Targeted {
    readonly pane_id: string;
}

const cells = (x: number, y: number, width: number, height: number): Cells => ({ x, y, width, height });

const WIDE = cells(0, 0, 189, 54);
const PHONE = cells(0, 0, 55, 50);
const AGENTS = new Set(['w1:p1', 'w1:p2', 'w1:p4', 'w1:p7']);

const sideBySide: readonly PaneSpec[] = [
    { id: 'w1:p1', agent: 'claude', title: 'tab-recap', rect: cells(0, 0, 94, 54) },
    { id: 'w1:p2', agent: 'codex', title: 'tab-recap:bar', listOnly: true, rect: cells(95, 0, 94, 54) },
];

const LOOK_ALIKE_TAB: TabSpec = { area: WIDE, panes: sideBySide, splits: [{ direction: 'right', ratio: 0.5, rect: WIDE }] };

const LOOK_ALIKE_TAB_OPENED: TabSpec = {
    area: WIDE,
    panes: [
        sideBySide[0] as PaneSpec,
        { id: 'w1:p2', agent: 'codex', title: 'tab-recap:bar', listOnly: true, rect: cells(95, 0, 47, 54) },
        { id: COLUMN_PANE, title: 'tab-recap', label: 'Recap', rect: cells(143, 0, 46, 54) },
    ],
    splits: [{ direction: 'right', ratio: 0.5, rect: WIDE }, { direction: 'right', ratio: 0.5, rect: cells(95, 0, 94, 54) }],
};

const SIDE_TAB: TabSpec = {
    tab: 'w1:t2',
    area: WIDE,
    panes: [
        { id: 'w1:p4', agent: 'claude', tab: 'w1:t2', rect: cells(0, 0, 140, 54) },
        { id: 'w1:p5', title: 'tab-recap', label: 'Recap', tab: 'w1:t2', rect: cells(141, 0, 48, 54) },
        { id: 'w1:p6', title: 'zsh', label: 'Recap', tab: 'w1:t2', rect: cells(141, 0, 48, 54) },
    ],
    splits: [{ direction: 'right', ratio: 0.74, rect: WIDE }],
};

const BAR_TAB: TabSpec = {
    tab: 'w1:t3',
    area: PHONE,
    panes: [
        { id: 'w1:p7', agent: 'claude', tab: 'w1:t3', rect: cells(0, 0, 55, 46) },
        { id: 'w1:p8', title: 'tab-recap:bar', tab: 'w1:t3', rect: cells(0, 47, 55, 3) },
    ],
    splits: [{ direction: 'down', ratio: 0.92, rect: PHONE }],
};

let world: ColumnsWorld;
let closedBeforeStop: readonly string[];
let stopped: string;

const closed = (): readonly string[] => world.requests('pane.close').map((request) => (request.params as Targeted).pane_id);

before(async () => {
    world = await columnsWorld();
    await world.opened([LOOK_ALIKE_TAB, SIDE_TAB, BAR_TAB], [LOOK_ALIKE_TAB_OPENED, SIDE_TAB, BAR_TAB]);
    closedBeforeStop = closed();
});

after(async () => {
    await world.close();
});

test('a pane that hosts an agent is not taken for the column: its tab still gets a real one, split from the agent panes', { timeout: 30_000 }, () => {
    const opens = world.requests('plugin.pane.open').map((request) => request.params as Opened);
    const opened = sole(opens);
    assert.equal(opened.env['TAB_RECAP_TAB'], 'w1:t1');
    assert.equal(opened.target_pane_id, 'w1:p2');
});

test('while the plugin runs, the look-alike panes are never closed, resized or moved', { timeout: 30_000 }, () => {
    const resized = world.requests('pane.resize').map((request) => (request.params as Targeted).pane_id);
    assert.deepEqual(resized, [COLUMN_PANE]);
    assert.deepEqual(closedBeforeStop, ['w1:p6']);
    assert.deepEqual(world.world.herdr.receivedMethods().filter((method) => MUTATING.includes(method) && method !== 'pane.close'), []);
});

test('the user stops the plugin: every real column goes, side or bar, with the dead shell of one', { timeout: 30_000 }, async () => {
    const ran = await world.world.stop();
    stopped = ran.stdout;
    assert.equal(ran.code, 0, ran.stderr);
    await world.world.awaitLog(/stopping: closed 4 columns/);
    assert.deepEqual(closed().slice(closedBeforeStop.length).toSorted(), ['w1:p5', 'w1:p6', 'w1:p8', 'w1:p9']);
});

test('stop says the daemon closes its columns and exits, and none of the agent panes is among the closed', { timeout: 30_000 }, () => {
    assert.match(stopped, /closes its columns and exits/);
    assert.deepEqual(closed().filter((pane) => AGENTS.has(pane)), []);
    assert.deepEqual(world.requests('pane.resize').map((request) => (request.params as Targeted).pane_id), [COLUMN_PANE]);
});
