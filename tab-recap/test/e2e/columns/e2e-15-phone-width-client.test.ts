import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { columnsWorld, COLUMN_PANE, MUTATING, sole, TAB, type Cells, type ColumnsWorld, type TabSpec } from '../support/columns-world.ts';

interface Params {
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
const bar = (rect: Cells): TabSpec['panes'][number] => ({ id: COLUMN_PANE, title: 'tab-recap:bar', label: 'Recap', rect });

const opens = (world: ColumnsWorld): readonly Params[] => world.requests('plugin.pane.open').map((request) => request.params as Params);
const resizes = (world: ColumnsWorld): readonly Resize[] => world.requests('pane.resize').map((request) => request.params as Resize);

const PHONE = cells(0, 0, 55, 50);
const BOTTOM_WIDE = cells(21, 31, 34, 19);

const TABLE: TabSpec = {
    area: PHONE,
    panes: [
        { id: 'w1:p1', agent: 'claude', rect: cells(0, 0, 55, 30) },
        { id: 'w1:p2', agent: 'codex', rect: cells(0, 31, 20, 19) },
        { id: 'w1:p3', rect: BOTTOM_WIDE },
    ],
    splits: [{ direction: 'down', ratio: 0.8, rect: PHONE }, { direction: 'right', ratio: 0.36, rect: cells(0, 31, 55, 19) }],
};

const TABLE_OPENED: TabSpec = {
    area: PHONE,
    panes: [
        TABLE.panes[0] as TabSpec['panes'][number],
        TABLE.panes[1] as TabSpec['panes'][number],
        { id: 'w1:p3', rect: cells(21, 31, 34, 15) },
        bar(cells(21, 47, 34, 3)),
    ],
    splits: [...TABLE.splits, { direction: 'down', ratio: 0.5, rect: BOTTOM_WIDE }],
};

describe('a phone-width client opens an agent', () => {
    let world: ColumnsWorld;

    before(async () => {
        world = await columnsWorld();
        await world.opened([TABLE], [TABLE_OPENED]);
    });

    after(async () => {
        await world.close();
    });

    test('the bar is split below the lowest pane, the widest of them, never on top', { timeout: 30_000 }, () => {
        const params = sole(opens(world));
        assert.equal(params.placement, 'split');
        assert.equal(params.direction, 'down');
        assert.equal(params.target_pane_id, 'w1:p3');
        assert.equal(params.focus, false);
        assert.equal(params.entrypoint, 'column');
        assert.deepEqual(params.env, { TAB_RECAP_TAB: TAB, TAB_RECAP_STATE: world.world.stateDir, TAB_RECAP_SHAPE: 'bar' });
    });

    test('the bar is three rows: the bottom divider, the one that ends where the bar ends, moves down', { timeout: 30_000 }, () => {
        const resize = sole(resizes(world));
        assert.equal(resize.pane_id, COLUMN_PANE);
        assert.equal(resize.direction, 'down');
        assert.ok(Math.abs(resize.amount - (1 - 3 / 19 - 0.5)) < 1e-9, `amount ${resize.amount}`);
    });

    test('the daemon says the bar is open', { timeout: 30_000 }, async () => {
        await world.world.awaitLog(/tab w1:t1: column opened \(w1:p9, bar\)/);
    });

    test('the agent panes are only read: nothing is swapped, moved, closed or focused, and only the bar is resized', { timeout: 30_000 }, () => {
        const methods = world.world.herdr.receivedMethods();
        assert.deepEqual(methods.filter((method) => MUTATING.includes(method)), []);
        assert.ok(resizes(world).every((resize) => resize.pane_id === COLUMN_PANE));
    });
});

const phone = (height: number, ratio: number): readonly [TabSpec, TabSpec] => {
    const area = cells(0, 0, 57, height);
    const initial: TabSpec = { area, panes: [{ id: 'w1:p1', agent: 'claude', rect: area }], splits: [] };
    const opened: TabSpec = {
        area,
        panes: [{ id: 'w1:p1', agent: 'claude', rect: cells(0, 0, 57, height - 4) }, bar(cells(0, height - 3, 57, 3))],
        splits: [{ direction: 'down', ratio, rect: area }],
    };
    return [initial, opened];
};

describe('the bar divider on a tall and on a settled phone tab', () => {
    let tall: ColumnsWorld;
    let settled: ColumnsWorld;

    before(async () => {
        tall = await columnsWorld();
        settled = await columnsWorld();
        const [high, highOpened] = phone(100, 0.5);
        await tall.opened([high], [highOpened]);
        const [low, lowOpened] = phone(24, 1 - 3 / 24);
        await settled.opened([low], [lowOpened]);
    });

    after(async () => {
        await tall.close();
        await settled.close();
    });

    test('the divider never goes past 0.95 of the height', { timeout: 30_000 }, () => {
        const resize = sole(resizes(tall));
        assert.equal(resize.direction, 'down');
        assert.ok(Math.abs(resize.amount - (0.95 - 0.5)) < 1e-9, `amount ${resize.amount}`);
    });

    test('a bar already three rows high is not resized', { timeout: 30_000 }, () => {
        assert.equal(opens(settled).length, 1);
        assert.deepEqual(resizes(settled), []);
    });
});
