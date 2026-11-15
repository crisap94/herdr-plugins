import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fleet, patchDoc, asV1, docPath } from './support/fixture.ts';
import { DARK, reset, world } from './support/herdr.ts';
import { mount } from './support/mount.ts';
import { settle, storage } from './support/register.ts';
import { byId, callsOf, click, find, hasCall, hasHandler, hasId, iconsOf, idsOf, press, text } from './support/tree.ts';

const SHOP = 'w1:t1';
const TINT_BORDER = '#ef5a5a8c';
const TINT_FILL = '#ef5a5a0f';
const HINT_BORDER = '#e0a43a99';

const colors = (node: object, name: string): unknown[] => callsOf(node, name).map((args) => args[0]);

test.beforeEach(() => { reset(); storage.map.clear(); fleet(); });

const open = async (tab = SHOP): ReturnType<typeof mount> => mount({ role: 'brief', tab });

test('the brief shows the title, the status pill and the goal', async () => {
    const view = await open();
    const tree = view.render();
    assert.match(text(tree), /shop/);
    assert.match(text(tree), /Needs you/);
    assert.match(text(tree), /Goal: Ship it/);
    assert.match(text(byId(tree, 'view-brief')), /Brief/);
});

test('the needs card uses the blocked tints, shows the wait, the reason and the actions', async () => {
    const view = await open();
    const tree = view.render();
    const card = find(tree, (data) => data.calls.some((call) => call.name === 'border_color' && call.args[0] === TINT_BORDER));
    assert.deepEqual(colors(card, 'bg'), [TINT_FILL]);
    const words = text(card);
    assert.match(words, /WAITING 25 MIN/);
    assert.match(words, /Which effort should the curator default to/);
    assert.match(words, /it sets the cost of every run/);
    assert.ok(hasId(card, 'jump'));
});

test('Reply and Send are disabled and explain why, and Jump is live', async () => {
    const view = await open();
    const tree = view.render();
    const reply = byId(tree, 'reply');
    assert.ok(hasCall(reply, 'tooltip'));
    assert.equal(hasHandler(reply, 'on_click'), false);
    assert.deepEqual(colors(reply, 'opacity'), [0.5]);
    assert.ok(hasCall(byId(tree, 'send-tip'), 'tooltip'));
    assert.equal(hasHandler(byId(tree, 'send'), 'on_click'), false);
    assert.ok(hasHandler(byId(tree, 'jump'), 'on_click'));
});

test('Jump selects the tab and focuses the blocked lane', async () => {
    const view = await open();
    click(byId(view.render(), 'jump'), view.cx);
    assert.deepEqual(world.runLog, [{ name: 'tab.select', args: { id: SHOP } }, { name: 'pane.focus', args: { terminal: 'w1:p1' } }]);
});

test('lane chips show the hint border, the compact prompt and the tick at the hint', async () => {
    const view = await open();
    const tree = view.render();
    const first = byId(tree, 'lane-0');
    const second = byId(tree, 'lane-1');
    assert.deepEqual(colors(first, 'border_color'), [HINT_BORDER]);
    assert.match(text(first), /compact\?/);
    assert.match(text(first), /50%/);
    assert.deepEqual(colors(second, 'border_color'), [DARK['border']]);
    assert.doesNotMatch(text(second), /compact\?/);
    const tick = find(first, (data) => data.calls.some((call) => call.name === 'left' && call.args[0] === '40%'));
    assert.deepEqual(colors(tick, 'opacity'), [0.7]);
});

test('the lane meter is neutral below the hint and amber from the hint', async () => {
    const view = await open();
    const tree = view.render();
    const fill = (lane: string, width: string): unknown => colors(find(byId(tree, lane), (data) => data.calls.some((call) => call.name === 'w' && call.args[0] === width) && data.calls.some((call) => call.name === 'bg' && call.args[0] !== DARK['hover'])), 'bg')[0];
    assert.equal(fill('lane-0', '50%'), DARK['working']);
    assert.equal(fill('lane-1', '20%'), DARK['idle']);
});

test('the banner counts what is new since the stored time and names how long ago', async () => {
    const view = await open();
    const banner = text(view.render());
    assert.match(banner, /Since you last looked \(1 d ago\):/);
    assert.match(banner, /1 need open/);
    assert.match(banner, /1 new decision/);
    assert.match(banner, /3 progress updates/);
});

test('the banner keeps the value held at open, and the time is stored only on leaving', async () => {
    const view = await open();
    assert.equal(storage.map.size, 0);
    const before = text(view.render());
    view.cx.advance(60_000);
    assert.equal(text(view.render()), before);
    assert.equal(storage.map.size, 0);
    press(view.render(), 'escape', view.cx);
    assert.deepEqual(JSON.parse(storage.map.get('tab-recap.seen') ?? '{}'), { [SHOP]: world.now });
});

test('reopening after leaving says nothing is new', async () => {
    const view = await open();
    press(view.render(), 'escape', view.cx);
    press(view.render(), 'enter', view.cx);
    await settle();
    assert.match(text(view.render()), /nothing new/);
});

test('closing the window stores the time and removes the open marker', async () => {
    const view = await open();
    await view.close();
    assert.ok(storage.map.has('tab-recap.seen'));
    assert.deepEqual(world.execLog.at(-1), { command: 'rm', argv: ['-f', '/state/gui/open.w1%3At1'] });
});

test('decisions expand on click to show their reason', async () => {
    const view = await open();
    assert.doesNotMatch(text(view.render()), /one file, no server/);
    click(find(byId(view.render(), 'dec-0'), (data) => data.handlers.has('on_click')), view.cx);
    assert.match(text(view.render()), /one file, no server/);
});

test('now and next lists come from the document and show the empty line when there is none', async () => {
    const view = await open();
    const words = text(view.render());
    assert.match(words, /Running the tests/);
    assert.match(words, /Draw the timeline/);
    reset();
    storage.map.clear();
    fleet();
    patchDoc(SHOP, (doc) => { doc['tasks'] = []; });
    const bare = await open();
    assert.match(text(bare.render()), /Nothing running\./);
    assert.match(text(bare.render()), /Nothing planned\./);
});

test('the view buttons 1 to 4 switch between brief, story, timeline and session', async () => {
    const view = await open();
    const active = (): string => ['brief', 'story', 'timeline', 'session'].find((key) => colors(byId(view.render(), `view-${key}`), 'bg')[0] === DARK['raised']) ?? '';
    press(view.render(), '2', view.cx);
    assert.equal(active(), 'story');
    press(view.render(), '3', view.cx);
    assert.equal(active(), 'timeline');
    press(view.render(), '4', view.cx);
    assert.equal(active(), 'session');
    press(view.render(), '1', view.cx);
    assert.equal(active(), 'brief');
    click(byId(view.render(), 'view-timeline'), view.cx);
    assert.equal(active(), 'timeline');
});

test('a v1 document renders with the older-daemon line and does not throw', async () => {
    asV1(SHOP);
    const view = await open();
    assert.doesNotThrow(() => view.render());
    assert.ok(hasId(view.render(), 'n-v1'));
    assert.match(text(view.render()), /nothing new/);
    for (const key of ['2', '3', '4', '1']) {
        press(view.render(), key, view.cx);
        assert.doesNotThrow(() => view.render(), key);
    }
});

test('a missing document, an unreadable one and a newer one each show a message', async () => {
    world.files.delete(docPath(SHOP));
    const missing = await open();
    assert.ok(hasId(missing.render(), 'n-none'));
    assert.deepEqual(idsOf(missing.render(), 'lane-'), []);
    world.files.set(docPath(SHOP), '{broken');
    const broken = await open();
    assert.ok(hasId(broken.render(), 'n-bad'));
    world.files.set(docPath(SHOP), JSON.stringify({ version: 9 }));
    const newer = await open();
    assert.ok(hasId(newer.render(), 'n-newer'));
    world.files.set(docPath(SHOP), JSON.stringify({ version: 'two' }));
    const odd = await open();
    assert.ok(hasId(odd.render(), 'n-bad'));
});

test('a stale daemon version and a document error each show a line', async () => {
    patchDoc(SHOP, (doc) => { doc['versions'] = { ...(typeof doc['versions'] === 'object' ? doc['versions'] : {}), stale: 'yes' }; doc['error'] = 'backend failed'; });
    const view = await open();
    assert.ok(hasId(view.render(), 'n-stale'));
    assert.match(text(byId(view.render(), 'n-err')), /backend failed/);
});

test('the story view shows the stories and the chapter count; the session view renders', async () => {
    const view = await open();
    press(view.render(), '2', view.cx);
    assert.match(text(view.render()), /No story yet|Writing the story/);
    press(view.render(), '4', view.cx);
    assert.doesNotThrow(() => view.render());
    assert.ok(iconsOf(view.render()).length > 0);
});

test('a link label drops the address from its text and keeps the words', async () => {
    patchDoc(SHOP, (doc) => {
        const task = Array.isArray(doc['tasks']) ? doc['tasks'][0] : null;
        if (task && typeof task === 'object') {
            const facts = Reflect.get(task, 'facts');
            const regions = Reflect.get(task, 'regions');
            const url = 'https://git.example/x';
            facts.push({ id: 'l1', text: `MR 42 ${url}`, ref: null, state: 'open', firstAt: 1, why: null, closedWhy: null, spans: [{ text: 'MR', url }] });
            regions['links'] = ['l1'];
        }
    });
    const view = await open();
    assert.equal(text(byId(view.render(), 'link-0')), 'MR 42');
});
