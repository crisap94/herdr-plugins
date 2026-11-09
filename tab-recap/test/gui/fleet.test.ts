import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fleet, live } from './support/fixture.ts';
import { DARK, LIGHT, reset, world } from './support/herdr.ts';
import { dataOf } from './support/kit.ts';
import { mount } from './support/mount.ts';
import { settle } from './support/register.ts';
import { byId, callsOf, click, find, hasCall, hasId, iconsOf, idsOf, inputState, press, text } from './support/tree.ts';

const ICON = 'mods/tab-recap/icons/';
const ROWS = ['row-w1:t1', 'row-w1:t3', 'row-w1:t2', 'row-w1:t4'];

const shape = (tree: object): string[] => idsOf(tree, 'row-').concat(iconsOf(tree));
const colors = (node: object, name: string): unknown[] => callsOf(node, name).map((args) => args[0]);

test.beforeEach(() => { reset(); fleet(); });

test('the router builds the fleet by default, a named role, and a named error for an unknown role', async () => {
    const byDefault = await mount(null);
    assert.ok(hasId(byDefault.render(), 'fleet-list'));
    reset();
    const unknown = await mount({ role: 'nonsense' });
    assert.match(text(unknown.render()), /no role "nonsense"/);
});

test('rows are grouped in urgency order with done before working', async () => {
    const view = await mount({ role: 'fleet' });
    const tree = view.render();
    assert.deepEqual(idsOf(tree, 'group-'), ['group-blocked', 'group-done', 'group-working', 'group-idle']);
    assert.deepEqual(idsOf(tree, 'row-'), ROWS);
});

test('the first row in urgency order is selected, with the accent edge and the selected fill', async () => {
    const view = await mount({ role: 'fleet' });
    const tree = view.render();
    const first = byId(tree, ROWS[0] ?? '');
    const second = byId(tree, ROWS[1] ?? '');
    assert.deepEqual(colors(first, 'border_color'), [DARK['accent']]);
    assert.deepEqual(colors(first, 'bg'), [DARK['selected']]);
    assert.deepEqual(colors(second, 'border_color'), [DARK['surface']]);
});

test('j and k move the selection and stop at both ends', async () => {
    const view = await mount({ role: 'fleet' });
    const selected = (): string => idsOf(view.render(), 'row-').find((id) => colors(byId(view.render(), id), 'border_color')[0] === DARK['accent']) ?? '';
    press(view.render(), 'k', view.cx);
    assert.equal(selected(), ROWS[0]);
    press(view.render(), 'j', view.cx);
    assert.equal(selected(), ROWS[1]);
    press(view.render(), 'j', view.cx);
    press(view.render(), 'j', view.cx);
    press(view.render(), 'j', view.cx);
    assert.equal(selected(), ROWS[3]);
    press(view.render(), 'k', view.cx);
    assert.equal(selected(), ROWS[2]);
});

test('modifier chords do not move the selection', async () => {
    const view = await mount({ role: 'fleet' });
    press(view.render(), 'j', view.cx, { control: true });
    assert.deepEqual(colors(byId(view.render(), ROWS[0] ?? ''), 'border_color'), [DARK['accent']]);
});

test('Enter opens the selected tab as a brief, Esc returns to the fleet, a second Esc closes the window', async () => {
    const view = await mount({ role: 'fleet', overlay: 'win-1' });
    press(view.render(), 'j', view.cx);
    press(view.render(), 'enter', view.cx);
    await settle();
    assert.ok(hasId(view.render(), 'back'));
    assert.match(text(byId(view.render(), 'view-brief')), /Brief/);
    press(view.render(), 'escape', view.cx);
    assert.ok(hasId(view.render(), 'fleet-list'));
    assert.deepEqual(world.closed, []);
    press(view.render(), 'escape', view.cx);
    assert.deepEqual(world.closed, ['win-1']);
});

test('a click on a row opens its brief', async () => {
    const view = await mount({ role: 'fleet' });
    click(byId(view.render(), ROWS[2] ?? ''), view.cx);
    await settle();
    assert.match(text(view.render()), /w1:t2|blog/);
    assert.ok(hasId(view.render(), 'back'));
});

test('a status filter keeps only that status and shows the counts', async () => {
    const view = await mount({ role: 'fleet' });
    assert.match(text(byId(view.render(), 'filter-working')), /Working\s+1/);
    click(byId(view.render(), 'filter-working'), view.cx);
    assert.deepEqual(idsOf(view.render(), 'row-'), ['row-w1:t2']);
    assert.deepEqual(idsOf(view.render(), 'group-'), ['group-working']);
    click(byId(view.render(), 'filter-working'), view.cx);
    assert.equal(idsOf(view.render(), 'row-').length, 4);
});

test('search covers the name, the space and the headline, and shows a message when nothing matches', async () => {
    const view = await mount({ role: 'fleet' });
    const field = inputState(view.render(), 'q');
    field.set_value('Drafting');
    field.fire('change', view.cx);
    assert.deepEqual(idsOf(view.render(), 'row-'), ['row-w1:t2']);
    field.set_value('WORK');
    field.fire('change', view.cx);
    assert.equal(idsOf(view.render(), 'row-').length, 4);
    field.set_value('zzz');
    field.fire('change', view.cx);
    assert.match(text(byId(view.render(), 'fleet-list')), /No tabs match/);
});

test('the headline is red only for a tab that needs you, and the wait shows only with a waiting time', async () => {
    const view = await mount({ role: 'fleet' });
    const tree = view.render();
    const headline = (id: string, words: string): object => find(byId(tree, id), (data) => data.children.includes(words));
    assert.deepEqual(colors(headline('row-w1:t1', 'Which effort should the curator default to'), 'text_color'), [DARK['blocked']]);
    assert.notDeepEqual(colors(headline('row-w1:t2', 'Drafting posts'), 'text_color'), [DARK['blocked']]);
    assert.match(text(byId(tree, 'row-w1:t1')), /waiting 25 min/);
    assert.doesNotMatch(text(byId(tree, 'row-w1:t2')), /waiting/);
});

test('status shapes: one icon per status, and only working spins', async () => {
    const view = await mount({ role: 'fleet' });
    const tree = view.render();
    const first = (id: string): string | undefined => iconsOf(byId(tree, id))[0];
    assert.equal(first('row-w1:t1'), `${ICON}blocked.svg`);
    assert.equal(first('row-w1:t3'), `${ICON}done.svg`);
    assert.equal(first('row-w1:t2'), `${ICON}working.svg`);
    assert.equal(first('row-w1:t4'), `${ICON}idle.svg`);
    const spinning = find(byId(tree, 'row-w1:t2'), (data) => data.extra.get('path') === `${ICON}working.svg`);
    assert.ok(hasCall(spinning, 'spin'));
    assert.ok(!hasCall(find(byId(tree, 'row-w1:t1'), (data) => data.extra.get('path') === `${ICON}blocked.svg`), 'spin'));
});

test('status colours follow the role: blocked red, done green, working amber, idle grey', async () => {
    const view = await mount({ role: 'fleet' });
    const tree = view.render();
    const colour = (id: string): unknown => colors(find(byId(tree, id), (data) => data.kind === 'svg'), 'text_color')[0];
    assert.equal(colour('row-w1:t1'), DARK['blocked']);
    assert.equal(colour('row-w1:t3'), DARK['done']);
    assert.equal(colour('row-w1:t2'), DARK['working']);
    assert.equal(colour('row-w1:t4'), DARK['idle']);
});

test('the light theme changes colours and nothing else', async () => {
    const dark = await mount({ role: 'fleet' });
    const darkShape = shape(dark.render());
    const darkRow = colors(find(byId(dark.render(), ROWS[0] ?? ''), (data) => data.kind === 'svg'), 'text_color')[0];
    world.light = true;
    assert.deepEqual(shape(dark.render()), darkShape);
    const lightRow = colors(find(byId(dark.render(), ROWS[0] ?? ''), (data) => data.kind === 'svg'), 'text_color')[0];
    assert.notEqual(lightRow, darkRow);
    assert.equal(lightRow, LIGHT['blocked']);
});

test('the meter turns amber at the hint and flips only from the hint upward', async () => {
    const view = await mount({ role: 'fleet' });
    const tree = view.render();
    const fill = (id: string): unknown => {
        const bars = callsOf(find(byId(tree, id), (data) => data.calls.some((call) => call.name === 'left' && call.args[0] === 0 && data.calls.some((one) => one.name === 'w' && one.args[0] === '50%'))), 'bg');
        return bars[0]?.[0];
    };
    assert.equal(fill('row-w1:t1'), DARK['working']);
    assert.match(text(byId(tree, 'row-w1:t1')), /compact\?/);
    assert.doesNotMatch(text(byId(tree, 'row-w1:t2')), /compact\?/);
});

test('a live tab without an index row still shows, named by the live tab and described by its agent title', async () => {
    live([{ id: 'w1:t9', name: 'scratch', status: 'working' }, { id: 'w1:t1', name: 'shop', status: 'blocked' }]);
    world.agents = [{ tab: 'w1:t9', title: 'fixing lint', address: 'w1:p9', status: 'working' }];
    const view = await mount({ role: 'fleet' });
    const tree = view.render();
    assert.deepEqual(idsOf(tree, 'row-'), ['row-w1:t1', 'row-w1:t9']);
    assert.match(text(byId(tree, 'row-w1:t9')), /scratch/);
    assert.match(text(byId(tree, 'row-w1:t9')), /fixing lint/);
    assert.match(text(byId(tree, 'row-w1:t9')), /no recap yet/);
});

test('a row whose tab is no longer open is dropped', async () => {
    live([{ id: 'w1:t1', name: 'shop', status: 'blocked' }]);
    const view = await mount({ role: 'fleet' });
    assert.deepEqual(idsOf(view.render(), 'row-'), ['row-w1:t1']);
});

test('the live status wins over the status in the index', async () => {
    live([{ id: 'w1:t1', name: 'shop', status: 'done' }, { id: 'w1:t2', name: 'blog', status: 'working' }]);
    const view = await mount({ role: 'fleet' });
    assert.deepEqual(idsOf(view.render(), 'group-'), ['group-done', 'group-working']);
});

test('an empty index shows the empty message', async () => {
    reset();
    const view = await mount({ role: 'fleet' });
    assert.match(text(byId(view.render(), 'fleet-list')), /No recaps yet/);
});

test('the bar counts blocked and working tabs', async () => {
    const view = await mount({ role: 'fleet' });
    assert.match(text(view.render()), /1 need you, 1 working/);
});

test('a gear control exists and does nothing', async () => {
    const view = await mount({ role: 'fleet' });
    const gear = byId(view.render(), 'gear-tip');
    assert.ok(hasCall(gear, 'tooltip'));
    assert.equal(dataOf(byId(view.render(), 'gear-tip')).handlers.size, 0);
});
