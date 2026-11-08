import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fleet, setStage, stageRecord, patchRow } from './support/fixture.ts';
import { DARK, NOW, command, reset, touch, world } from './support/herdr.ts';
import { dataOf } from './support/kit.ts';
import { mount } from './support/mount.ts';
import { settle, storage } from './support/register.ts';
import { byId, callsOf, click, find, hasId, iconsOf, text } from './support/tree.ts';

const ICON = 'mods/tab-recap/icons/';
const WINDOW = { mod: 'tab-recap', kind: 'window', key: 'tab-recap', width: 780, height: 620, keep: true };

let epoch = 0;
const stamp = (): void => { patchRow('w1:t1', (row) => { row['at'] = NOW + (epoch += 100); }); };

test.beforeEach(() => { reset(); storage.map.clear(); fleet(); });

test('the chip counts blocked and working tabs and shows the worst status shape', async () => {
    const view = await mount({ role: 'chip' });
    const tree = view.render();
    assert.match(text(tree), /1 needs you/);
    assert.match(text(tree), /1 working/);
    assert.equal(iconsOf(tree)[0], `${ICON}blocked.svg`);
});

test('the chip pulses a red ring only while something is blocked', async () => {
    const view = await mount({ role: 'chip' });
    assert.ok(find(view.render(), (data) => data.calls.some((call) => call.name === 'loop')));
    world.spaces = [{ id: 's', name: 'w', tabs: [{ id: 'w1:t2', name: 'blog', status: 'working' }] }];
    const calm = view.render();
    assert.equal(iconsOf(calm)[0], `${ICON}working.svg`);
    assert.equal(callsOf(calm, 'loop').length, 0);
});

test('a chip click opens the fleet window and a second click closes it', async () => {
    const view = await mount({ role: 'chip' });
    const body = (): object => find(view.render(), (data) => data.id === 'tab-recap-chip');
    click(body(), view.cx);
    assert.deepEqual(world.overlays.map((one) => one.spec), [{ ...WINDOW, props: { role: 'fleet' } }]);
    click(body(), view.cx);
    assert.deepEqual(world.closed, ['overlay-1']);
    click(body(), view.cx);
    assert.equal(world.overlays.length, 2);
});

test('a window that was closed from inside does not wedge the chip', async () => {
    const view = await mount({ role: 'chip' });
    const body = (): object => find(view.render(), (data) => data.id === 'tab-recap-chip');
    click(body(), view.cx);
    world.failClose = true;
    click(body(), view.cx);
    world.failClose = false;
    click(body(), view.cx);
    assert.equal(world.overlays.length, 2);
});

test('the fleet command from a key toggles the window', async () => {
    const view = await mount({ role: 'chip' });
    command('fleet');
    await settle();
    assert.equal(world.overlays.length, 1);
    assert.ok(view.cx.notifies > 0);
    command('fleet');
    await settle();
    assert.deepEqual(world.closed, ['overlay-1']);
});

test('the brief command opens the focused tab, and does nothing without a focused tab', async () => {
    await mount({ role: 'chip' });
    command('brief');
    await settle();
    assert.equal(world.overlays.length, 0);
    reset();
    fleet();
    await mount({ role: 'chip' });
    world.focusedTab = 'w1:t2';
    command('brief');
    await settle();
    assert.deepEqual(world.overlays.map((one) => one.spec), [{ ...WINDOW, props: { role: 'brief', tab: 'w1:t2' } }]);
});

test('the chip publishes the index rows to the strips, and only when they changed', async () => {
    const view = await mount({ role: 'chip' });
    const rows = world.shared.get('tab-recap.rows');
    assert.ok(Array.isArray(rows));
    assert.equal(rows.length, 4);
    const writes = world.sharedWrites;
    view.cx.advance(15_000);
    await settle();
    assert.equal(world.sharedWrites, writes);
    patchRow('w1:t2', (row) => { row['headline'] = 'something new'; });
    touch();
    await settle();
    assert.equal(world.sharedWrites, writes + 1);
});

test('the chip reloads when the folder changes and polls as a fallback', async () => {
    const view = await mount({ role: 'chip' });
    assert.match(text(view.render()), /1 working/);
    assert.ok(view.cx.intervals().includes(15_000));
});

const STRIP = { role: 'strip', pane: 'w1:p1' };
const agentPane = { pane: 'w1:p1', tab: 'w1:t1', terminal: 'w1:p1', title: 'claude', status: 'blocked' };

test('the strip shows the lane of its pane, the headline in red, and the context meter', async () => {
    world.panes = [agentPane];
    const view = await mount(STRIP);
    const tree = view.render();
    assert.equal(dataOf(tree).id, 'strip-w1:p1');
    assert.equal(iconsOf(tree)[0], `${ICON}blocked.svg`);
    const headline = byId(tree, 'strip-hl-w1:p1');
    assert.match(text(headline), /Which effort should the curator default to/);
    assert.deepEqual(callsOf(headline, 'text_color').map((args) => args[0]), [DARK['blocked']]);
    assert.match(text(tree), /50%/);
    assert.ok(view.cx.intervals().includes(15_000));
});

test('a strip click opens the brief of its tab', async () => {
    world.panes = [agentPane];
    const view = await mount(STRIP);
    click(view.render(), view.cx);
    assert.deepEqual(world.overlays.map((one) => one.spec), [{ ...WINDOW, props: { role: 'brief', tab: 'w1:t1' } }]);
});

test('a pane that is not an agent shows its title in a neutral line with no click', async () => {
    world.panes = [{ pane: 'w1:p1', tab: 'w1:t4', terminal: 'w1:term', title: 'zsh', status: null }];
    const view = await mount(STRIP);
    const tree = view.render();
    assert.match(text(tree), /^zsh$/);
    assert.equal(dataOf(tree).handlers.size, 0);
});

test('a strip for a pane that does not exist renders nothing and does not throw', async () => {
    const view = await mount(STRIP);
    assert.doesNotThrow(() => view.render());
    assert.equal(dataOf(view.render()).children.length, 0);
});

test('the strip shows the Compacting pill while its lane compacts', async () => {
    world.panes = [agentPane];
    setStage('w1:t1', 0, stageRecord('restoring', 4000));
    const view = await mount(STRIP);
    assert.match(text(view.render()), /Compacting/);
    setStage('w1:t1', 0, stageRecord('compacted', 4000));
    view.cx.advance(15_000);
    await settle();
    assert.doesNotMatch(text(view.render()), /Compacting/);
});

test('a toast is posted once for a finished compaction, per stage time', async () => {
    setStage('w1:t1', 0, stageRecord('compacted', 30_000));
    stamp();
    const view = await mount({ role: 'chip' });
    assert.equal(world.notices.length, 1);
    assert.deepEqual(world.notices[0], { title: 'Compacted, 80% to 5%', body: 'lane w1:p1 · 41 s' });
    assert.deepEqual(world.noticeSpecs[0]?.['action'], { name: 'pane.focus', args: { terminal: 'w1:p1' } });
    view.cx.advance(15_000);
    await settle();
    patchRow('w1:t1', (row) => { row['at'] = Number(row['at']) + 1; });
    touch();
    await settle();
    assert.equal(world.notices.length, 1);
});

test('a later compaction of the same lane posts a second toast', async () => {
    setStage('w1:t1', 0, stageRecord('compacted', 30_000));
    stamp();
    await mount({ role: 'chip' });
    setStage('w1:t1', 0, stageRecord('compacted', 10_000));
    patchRow('w1:t1', (row) => { row['at'] = Number(row['at']) + 5; });
    touch();
    await settle();
    assert.equal(world.notices.length, 2);
    assert.notEqual(world.noticeSpecs[0]?.['title'], undefined);
});

test('a compaction finished long ago posts nothing', async () => {
    setStage('w1:t1', 0, stageRecord('compacted', 20 * 60_000));
    stamp();
    await mount({ role: 'chip' });
    assert.deepEqual(world.notices, []);
});

test('an unreadable index leaves the chip rendering and posting nothing', async () => {
    world.files.set('/state/gui/index.json', '{nope');
    const view = await mount({ role: 'chip' });
    assert.doesNotThrow(() => view.render());
    assert.ok(hasId(view.render(), 'tab-recap-chip'));
});
