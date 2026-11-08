import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOG, DOCS, NO_HINT, SHOP, build, fleet, install, live, patchDoc } from './support/fixture.ts';
import { DARK, GUI_DIR, reset, world } from './support/herdr.ts';
import { dataOf } from './support/kit.ts';
import { mount } from './support/mount.ts';
import { storage } from './support/register.ts';
import { byId, callsOf, find, hasId, idsOf, iconsOf, press, text } from './support/tree.ts';

const TAB = 'w1:t1';
const ICON = 'mods/tab-recap/icons/';

test.beforeEach(() => { reset(); storage.map.clear(); });

test('a real index row drives the fleet: headline, wait, context and the hint flag', async () => {
    const [shop] = fleet();
    assert.equal(shop?.row['headline'], 'Which effort should the curator default to');
    const view = await mount({ role: 'fleet' });
    const row = text(byId(view.render(), 'row-w1:t1'));
    assert.match(row, /Which effort should the curator default to/);
    assert.match(row, /waiting 25 min/);
    assert.match(row, /2 lanes/);
    assert.match(row, /50%/);
    assert.match(row, /compact\?/);
});

test('a row without the newer fields, as an older daemon wrote it, still renders', async () => {
    live([{ id: 'w1:t5', name: 'old', status: null }]);
    world.files.set(`${GUI_DIR}/index.json`, JSON.stringify({ version: 1, tabs: [{ tab: 'w1:t5', name: 'old', status: 'idle', at: 5 }] }));
    const view = await mount({ role: 'fleet' });
    assert.deepEqual(idsOf(view.render(), 'row-'), ['row-w1:t5']);
    assert.match(text(byId(view.render(), 'row-w1:t5')), /No recap yet/);
});

test('rows that are not objects or have no tab are skipped, and an unreadable index shows no rows', async () => {
    live([{ id: 'w1:t1', name: 'shop', status: 'blocked' }]);
    world.files.set(`${GUI_DIR}/index.json`, JSON.stringify({ version: 1, tabs: [null, 5, { name: 'x' }, { tab: '' }, { tab: 'w1:t1', name: 'shop', status: 'blocked', at: 1 }] }));
    const view = await mount({ role: 'fleet' });
    assert.deepEqual(idsOf(view.render(), 'row-'), ['row-w1:t1']);
    reset();
    world.files.set(`${GUI_DIR}/index.json`, '{nope');
    live([{ id: 'w1:t1', name: 'shop', status: 'blocked' }]);
    const broken = await mount({ role: 'fleet' });
    assert.doesNotThrow(() => broken.render());
});

test('a tab with more lanes than the index lists keeps the real lane count', async () => {
    const wide = build({ ...SHOP, lanes: Array.from({ length: 10 }, (_, index) => ({ pane: `w1:p${index}`, status: 'working', tokens: 1000 })) });
    install([wide]);
    live([{ id: TAB, name: 'shop', status: 'working' }]);
    const view = await mount({ role: 'fleet' });
    assert.match(text(byId(view.render(), 'row-w1:t1')), /10 lanes/);
});

test('the hint from the document reaches the lane chips and a missing hint falls back to forty percent', async () => {
    install([build({ ...SHOP, hint: 60 })]);
    live([{ id: TAB, name: 'shop', status: 'blocked' }]);
    const view = await mount({ role: 'brief', tab: TAB });
    assert.doesNotMatch(text(byId(view.render(), 'lane-0')), /compact\?/);
    reset();
    install([build(NO_HINT)]);
    live([{ id: TAB, name: 'shop', status: 'blocked' }]);
    const fallback = await mount({ role: 'brief', tab: TAB });
    assert.match(text(byId(fallback.render(), 'lane-0')), /compact\?/);
});

test('the brief reads the document of the engine: sections, decisions and the order of the needs', async () => {
    const twice = build({ ...SHOP, facts: [...SHOP.facts, { id: 'n0', section: 'needs', text: 'Older question', minutesAgo: 90 }] });
    install([twice]);
    live([{ id: TAB, name: 'shop', status: 'blocked' }]);
    const view = await mount({ role: 'brief', tab: TAB });
    const words = text(view.render());
    assert.ok(words.indexOf('Older question') < words.indexOf('Which effort'));
    assert.match(words, /WAITING 90 MIN/);
    assert.equal(hasId(view.render(), 'jump'), true);
    assert.equal(idsOf(view.render(), 'jump').length, 1);
});

test('the story view renders the story text and turns spans into links that open only web addresses', async () => {
    install([build(SHOP)]);
    live([{ id: TAB, name: 'shop', status: 'blocked' }]);
    patchDoc(TAB, (doc) => {
        const task = Array.isArray(doc['tasks']) ? doc['tasks'][0] : null;
        if (task && typeof task === 'object') {
            Reflect.set(task, 'story', { text: 'The port is done', spans: [{ text: 'The port', url: 'https://git.example/mr/1' }, { text: ' is done', url: null }], at: 1 });
        }
    });
    const view = await mount({ role: 'brief', tab: TAB });
    press(view.render(), '2', view.cx);
    const body = find(view.render(), (data) => data.kind === 'TextView');
    assert.equal(dataOf(body).extra.get('markdown'), '[The port](https://git.example/mr/1) is done');
    const open = dataOf(body).handlers.get('on_link_click');
    open?.('javascript:alert(1)');
    open?.('https://git.example/mr/1');
    assert.deepEqual(world.execLog.filter((call) => call.command === 'xdg-open').map((call) => call.argv), [['https://git.example/mr/1']]);
});

test('the session view shows the tiles the document carries and a row per lane', async () => {
    install([build(SHOP)]);
    live([{ id: TAB, name: 'shop', status: 'blocked' }]);
    patchDoc(TAB, (doc) => {
        doc['session'] = {
            started: { at: 1, forMs: 3 * 3_600_000 }, runs: { total: 36, byCause: [{ cause: 'turn-ended', count: 30 }] }, compactions: { count: 2, byOrigin: { operator: 1, auto: 1 }, measured: [] },
            chapters: 3, agents: [{ label: 'orchestrator', share: 50, window: 200000 }], repo: { name: 'shop', branch: 'main' }, files: [{ path: 'a.ts', count: 3 }], autocompact: null,
        };
    });
    const view = await mount({ role: 'brief', tab: TAB });
    press(view.render(), '4', view.cx);
    const tiles = idsOf(view.render(), 'tile-').map((id) => text(byId(view.render(), id)));
    assert.deepEqual(tiles, ['3 h session length', '36 turns: 30 turn-ended', '2 compactions, 3 chapters', '1 files edited (top 5)', '50% context, orchestrator', 'shop main']);
    assert.match(text(view.render()), /lane w1:p1 50% of 200k/);
    press(view.render(), '2', view.cx);
    assert.match(text(view.render()), /3 chapters/);
});

test('tabs of every status render a brief without throwing, with the pill shape of their status', async () => {
    const all = [SHOP, BLOG, DOCS, { ...DOCS, tab: 'w1:t6', lanes: [{ pane: 'w1:p9', status: 'done' }] }].map(build);
    install(all);
    live(all.map((one) => ({ id: String(one.doc['tab']), name: String(one.doc['name']), status: null })));
    const shapes = [`${ICON}blocked.svg`, `${ICON}working.svg`, `${ICON}idle.svg`, `${ICON}done.svg`];
    for (const [index, one] of all.entries()) {
        const view = await mount({ role: 'brief', tab: String(one.doc['tab']) });
        assert.ok(iconsOf(view.render()).includes(shapes[index] ?? ''), String(one.doc['tab']));
    }
});

test('the unknown status draws the dashed ring in the unknown colour', async () => {
    install([build({ ...DOCS, lanes: [{ pane: 'w1:p9', status: 'weird' }] })]);
    live([{ id: 'w1:t4', name: 'docs', status: null }]);
    const view = await mount({ role: 'brief', tab: 'w1:t4' });
    const ring = find(view.render(), (data) => data.extra.get('path') === `${ICON}unknown.svg`);
    assert.deepEqual(callsOf(ring, 'text_color').map((args) => args[0]), [DARK['unknown']]);
});
