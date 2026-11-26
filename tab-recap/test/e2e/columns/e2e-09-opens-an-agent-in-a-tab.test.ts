import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { columnsWorld, COLUMN_PANE, MUTATING, sole, TAB, type Cells, type ColumnsWorld, type TabSpec } from '../support/columns-world.ts';

interface Params {
    readonly plugin_id: string;
    readonly entrypoint: string;
    readonly placement: string;
    readonly direction: string;
    readonly target_pane_id: string;
    readonly focus: boolean;
    readonly env: Readonly<Record<string, string>>;
}

interface Resize {
    readonly pane_id: string;
    readonly direction: string;
    readonly amount: number;
}

const cells = (x: number, y: number, width: number, height: number): Cells => ({ x, y, width, height });
const column = (rect: Cells): TabSpec['panes'][number] => ({ id: COLUMN_PANE, title: 'tab-recap', label: 'Recap', rect });

const AREA = cells(0, 0, 189, 54);
const RIGHT_COLUMN = cells(101, 0, 88, 54);
const RIGHT_BOTTOM = cells(101, 21, 88, 33);

const EDGES: TabSpec = {
    area: AREA,
    panes: [
        { id: 'w1:p1', agent: 'claude', rect: cells(0, 0, 100, 50) },
        { id: 'w1:p2', rect: cells(101, 0, 88, 20) },
        { id: 'w1:p3', rect: RIGHT_BOTTOM },
    ],
    splits: [{ direction: 'right', ratio: 0.53, rect: AREA }, { direction: 'down', ratio: 0.38, rect: RIGHT_COLUMN }],
};

const EDGES_OPENED: TabSpec = {
    area: AREA,
    panes: [
        EDGES.panes[0] as TabSpec['panes'][number],
        EDGES.panes[1] as TabSpec['panes'][number],
        { id: 'w1:p3', rect: cells(101, 21, 44, 33) },
        column(cells(146, 21, 43, 33)),
    ],
    splits: [...EDGES.splits, { direction: 'right', ratio: 0.5, rect: RIGHT_BOTTOM }],
};

const opens = (world: ColumnsWorld): readonly Params[] => world.requests('plugin.pane.open').map((request) => request.params as Params);
const resizes = (world: ColumnsWorld): readonly Resize[] => world.requests('pane.resize').map((request) => request.params as Resize);

describe('an agent opens in a wide tab', () => {
    let world: ColumnsWorld;

    before(async () => {
        world = await columnsWorld({ TAB_RECAP_WIDTH: '0.25' });
        await world.opened([EDGES], [EDGES_OPENED]);
    });

    after(async () => {
        await world.close();
    });

    test('one column is split on the right of the tallest pane on the right edge, without taking focus', { timeout: 30_000 }, () => {
        const params = sole(opens(world));
        assert.equal(params.placement, 'split');
        assert.equal(params.direction, 'right');
        assert.equal(params.target_pane_id, 'w1:p3');
        assert.equal(params.focus, false);
    });

    test('the split runs the column pane command for the tab', { timeout: 30_000 }, () => {
        const params = sole(opens(world));
        assert.equal(params.plugin_id, 'tab-recap');
        assert.equal(params.entrypoint, 'column');
        assert.deepEqual(params.env, { TAB_RECAP_TAB: TAB, TAB_RECAP_STATE: world.world.stateDir, TAB_RECAP_SHAPE: 'side' });
    });

    test('the width follows the setting: the innermost divider on the right edge moves to leave 47 of 189 cells', { timeout: 30_000 }, () => {
        const resize = sole(resizes(world));
        assert.equal(resize.pane_id, COLUMN_PANE);
        assert.equal(resize.direction, 'left');
        assert.ok(Math.abs(resize.amount - (0.5 - (1 - 47 / 88))) < 1e-9, `amount ${resize.amount}`);
    });

    test('the daemon says the column is open', { timeout: 30_000 }, async () => {
        await world.world.awaitLog(/tab w1:t1: column opened \(w1:p9, side\)/);
    });

    test('nothing else in the layout is swapped, moved, closed, focused or split', { timeout: 30_000 }, () => {
        const methods = world.world.herdr.receivedMethods();
        assert.deepEqual(methods.filter((method) => MUTATING.includes(method)), []);
    });
});

const single = (width: number, height: number, ratio: number | null, columnWidth: number): readonly [TabSpec, TabSpec] => {
    const area = cells(0, 0, width, height);
    const initial: TabSpec = { area, panes: [{ id: 'w1:p1', agent: 'claude', rect: area }], splits: [] };
    const opened: TabSpec = {
        area,
        panes: [{ id: 'w1:p1', agent: 'claude', rect: cells(0, 0, width - columnWidth - 1, height) }, column(cells(width - columnWidth, 0, columnWidth, height))],
        splits: [{ direction: 'right', ratio: ratio ?? 0.5, rect: area }],
    };
    return [initial, opened];
};

describe('the column width stays inside its bounds', () => {
    let narrow: ColumnsWorld;
    let wide: ColumnsWorld;

    before(async () => {
        narrow = await columnsWorld();
        wide = await columnsWorld();
        const [lean, leanOpened] = single(110, 40, null, 54);
        await narrow.opened([lean], [leanOpened]);
        const [broad, broadOpened] = single(400, 50, null, 200);
        await wide.opened([broad], [broadOpened]);
    });

    after(async () => {
        await narrow.close();
        await wide.close();
    });

    test('a tab just wide enough for a side column gets the 36-cell minimum, moving the divider right', { timeout: 30_000 }, () => {
        const resize = sole(resizes(narrow));
        assert.equal(resize.direction, 'right');
        assert.ok(Math.abs(resize.amount - (1 - 36 / 110 - 0.5)) < 1e-9, `amount ${resize.amount}`);
    });

    test('a very wide tab gets the 64-cell maximum', { timeout: 30_000 }, () => {
        const resize = sole(resizes(wide));
        assert.equal(resize.direction, 'right');
        assert.ok(Math.abs(resize.amount - (1 - 64 / 400 - 0.5)) < 1e-9, `amount ${resize.amount}`);
    });
});

describe('a column already at its width', () => {
    let world: ColumnsWorld;

    before(async () => {
        world = await columnsWorld({ TAB_RECAP_WIDTH: '0.25' });
        const [lone, opened] = single(189, 54, 1 - 47 / 189, 47);
        await world.opened([lone], [opened]);
    });

    after(async () => {
        await world.close();
    });

    test('is not resized', { timeout: 30_000 }, () => {
        assert.equal(opens(world).length, 1);
        assert.deepEqual(resizes(world), []);
    });
});
