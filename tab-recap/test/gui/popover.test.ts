import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fleet, setStage, stageRecord } from './support/fixture.ts';
import { DARK, launched, reset, world } from './support/herdr.ts';
import { dataOf } from './support/kit.ts';
import { mount } from './support/mount.ts';
import { loadGui, storage } from './support/register.ts';
import { BOUNDS, byId, callsOf, click, hasCall, hasHandler, hasId, iconsOf, inputState, mouseDown, press, text } from './support/tree.ts';

const SHOP = 'w1:t1';
const ICON = 'mods/tab-recap/icons/';

const PROPS = {
    role: 'compact', name: 'lane w1:p1', pct: 50, window: 200_000, hint: 40, tab: SHOP, terminal: 'w1:p1',
    lanes: [{ terminal: 'w1:p1', name: 'lane w1:p1', status: 'blocked' }, { terminal: 'w1:p2', name: 'lane w1:p2', status: 'working' }],
};

const colors = (node: object, name: string): unknown[] => callsOf(node, name).map((args) => args[0]);

test.beforeEach(() => { reset(); storage.map.clear(); fleet(); });

const open = async (): ReturnType<typeof mount> => mount({ role: 'brief', tab: SHOP });

test('a click on a lane chip opens a compact popup anchored under the chip', async () => {
    const view = await open();
    mouseDown(byId(view.render(), 'lane-0'), view.cx);
    assert.equal(world.overlays.length, 1);
    const spec = launched(0);
    assert.equal(spec['kind'], 'popup');
    assert.equal(spec['mod'], 'tab-recap');
    assert.deepEqual(spec['at'], { x: BOUNDS.x, y: BOUNDS.y + BOUNDS.height + 8 });
    assert.deepEqual(spec['props'], PROPS);
    assert.deepEqual(world.shared.get('tab-recap.popup'), { lane: 0 });
});

test('the open lane chip takes the accent border and a second click closes the popup', async () => {
    const view = await open();
    mouseDown(byId(view.render(), 'lane-0'), view.cx);
    assert.deepEqual(colors(byId(view.render(), 'lane-0'), 'border_color'), [DARK['accent']]);
    mouseDown(byId(view.render(), 'lane-0'), view.cx);
    assert.deepEqual(world.closed, ['overlay-1']);
    assert.equal(world.shared.get('tab-recap.popup'), null);
    assert.equal(world.overlays.length, 1);
});

test('opening another lane closes the first popup', async () => {
    const view = await open();
    mouseDown(byId(view.render(), 'lane-0'), view.cx);
    mouseDown(byId(view.render(), 'lane-1'), view.cx);
    assert.deepEqual(world.closed, ['overlay-1']);
    assert.equal(world.overlays.length, 2);
    assert.deepEqual(world.shared.get('tab-recap.popup'), { lane: 1 });
});

test('the c key opens the popup of the lane past the hint, at the pointer, and Esc leaves and closes it', async () => {
    const view = await open();
    press(view.render(), 'c', view.cx);
    assert.equal(launched(0)['at'], 'pointer');
    assert.deepEqual(launched(0)['props'], PROPS);
    press(view.render(), 'escape', view.cx);
    assert.deepEqual(world.closed, ['overlay-1']);
    assert.equal(world.shared.get('tab-recap.popup'), null);
});

test('a popup whose window is already gone does not break the next toggle', async () => {
    const view = await open();
    mouseDown(byId(view.render(), 'lane-0'), view.cx);
    world.failClose = true;
    assert.doesNotThrow(() => { mouseDown(byId(view.render(), 'lane-0'), view.cx); });
    assert.equal(world.shared.get('tab-recap.popup'), null);
});

test('the popover role shows the title, the hint line and the disabled Compact control', async () => {
    const view = await mount({ role: 'compact', name: 'orchestrator', pct: 50, window: 200_000, hint: 40, overlay: 'pop-1' });
    const tree = view.render();
    assert.match(text(tree), /Compact orchestrator/);
    assert.match(text(tree), /50% of 200k used, past the 40% hint/);
    assert.ok(iconsOf(tree).includes(`${ICON}bolt.svg`));
    assert.ok(hasCall(byId(tree, 'go-tip'), 'tooltip'));
    assert.equal(hasHandler(byId(tree, 'go'), 'on_click'), false);
    assert.deepEqual(colors(byId(tree, 'go'), 'opacity'), [0.5]);
});

test('below the hint the line says so with the clock icon, and an unknown context says that', async () => {
    const below = await mount({ role: 'compact', name: 'a', pct: 20, window: 200_000, hint: 40, overlay: 'p' });
    assert.match(text(below.render()), /20% of 200k used, below the 40% hint/);
    assert.ok(iconsOf(below.render()).includes(`${ICON}clock.svg`));
    const unknown = await mount({ role: 'compact', name: 'a', pct: null, window: null, hint: 40, overlay: 'p' });
    assert.match(text(unknown.render()), /context unknown, hint at 40%/);
});

test('Cancel closes the popup window and Close clears the shared marker', async () => {
    const view = await mount({ role: 'compact', name: 'a', pct: 1, window: 100, hint: 40, overlay: 'pop-7' });
    click(byId(view.render(), 'cancel'), view.cx);
    assert.deepEqual(world.closed, ['pop-7']);
    world.shared.set('tab-recap.popup', { lane: 0 });
    await view.close();
    assert.equal(world.shared.get('tab-recap.popup'), null);
});

test('the note is capped at 280 characters and the counter follows', async () => {
    const view = await mount({ role: 'compact', name: 'a', pct: 1, window: 100, hint: 40, overlay: 'p' });
    const note = inputState(view.render(), 'compact');
    note.set_value('x'.repeat(300));
    note.fire('change', view.cx);
    assert.equal(note.value().length, 280);
    assert.match(text(view.render()), /280 \/ 280/);
});

const shapeOf = (index: number, at: number): string => {
    if (index === at) {
        return 'working';
    }
    return index < at ? 'done' : 'idle';
};

const RUNNING: [string, RegExp][] = [
    ['briefing', /Briefing 12 s/],
    ['compacting', /Compacting 12 s/],
    ['restoring', /Restoring 12 s/],
];

for (const [stage, current] of RUNNING) {
    test(`the stepper for ${stage} marks the current step with its seconds and shows the Compacting pill`, async () => {
        setStage(SHOP, 0, stageRecord(stage, 12_000));
        const view = await open();
        const lane = byId(view.render(), 'lane-0');
        assert.match(text(lane), current);
        assert.match(text(lane), /Compacting/);
        assert.doesNotMatch(text(lane), /compact\?/);
        const order = ['briefing', 'compacting', 'restoring', 'compacted'];
        const at = order.indexOf(stage);
        const shapes = iconsOf(lane).filter((path) => [`${ICON}done.svg`, `${ICON}working.svg`, `${ICON}idle.svg`].includes(path));
        const expected = order.map((_, index) => shapeOf(index, at));
        assert.deepEqual(shapes.slice(-4).map((path) => path.replace(ICON, '').replace('.svg', '')), expected);
    });
}

test('a running lane is not clickable: no popup opens', async () => {
    setStage(SHOP, 0, stageRecord('compacting', 12_000));
    const view = await open();
    mouseDown(byId(view.render(), 'lane-0'), view.cx);
    assert.deepEqual(world.overlays, []);
    assert.equal(colors(byId(view.render(), 'lane-0'), 'border_color')[0], DARK['working']);
});

for (const stage of ['compacted', 'failed', 'unconfirmed', 'skipped']) {
    test(`a ${stage} stage clears the stepper and the pill and the chip is clickable again`, async () => {
        setStage(SHOP, 0, stageRecord(stage, 12_000));
        const view = await open();
        const lane = byId(view.render(), 'lane-0');
        assert.doesNotMatch(text(lane), /Compacting|Briefing|Restoring/);
        mouseDown(lane, view.cx);
        assert.equal(world.overlays.length, 1);
    });
}

test('a running stage older than ten minutes is treated as over', async () => {
    setStage(SHOP, 0, stageRecord('compacting', 11 * 60_000));
    const view = await open();
    assert.doesNotMatch(text(byId(view.render(), 'lane-0')), /Compacting/);
});

test('the lane chips of both lanes keep their ids when only one is compacting', async () => {
    setStage(SHOP, 1, stageRecord('restoring', 3000));
    const view = await open();
    assert.ok(hasId(view.render(), 'lane-0'));
    assert.match(text(byId(view.render(), 'lane-1')), /Restoring 3 s/);
    assert.equal(dataOf(byId(view.render(), 'lane-0')).handlers.has('on_mouse_down'), true);
});

test('the note placeholder fits the field on one line, so it is never cut mid-word', async () => {
    const { TEXT } = await loadGui<{ TEXT: { popPlaceholder: string } }>('text.js');
    assert.ok(TEXT.popPlaceholder.length <= 40, `${TEXT.popPlaceholder.length} characters`);
});
