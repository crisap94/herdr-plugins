import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeApi, until } from './support/fake-api.ts';
import { GUI_DIR, reset, world } from './support/herdr.ts';
import { fleet, readJson, type Json } from './support/fixture.ts';
import { makeCx } from './support/cx.ts';
import { mount, type Mounted } from './support/mount.ts';
import type { ModuleOf, Role } from './support/api.ts';
import { loadGui, settleSlow, storage } from './support/register.ts';
import { text } from './support/tree.ts';

interface Forgetful {
    api: { forget(): void };
}

const client = await loadGui<Forgetful>('api.js');
const SHOP = 'w1:t1';
const DOWN = 'The recap daemon is not running.';
const DOC_PATH = '/v1/tabs/w1%3At1';
const HEALTH = '/v1/health';

let live: FakeApi[] = [];
let views: Mounted[] = [];

async function serve(): Promise<FakeApi> {
    const api = await FakeApi.start();
    live.push(api);
    return api;
}

async function brief(): Promise<Mounted> {
    const view = await mount({ role: 'brief', tab: SHOP });
    views.push(view);
    return view;
}

function served(headline: string): string {
    const index = readJson(`${GUI_DIR}/index.json`);
    const rows = (Array.isArray(index['tabs']) ? index['tabs'] : []) as Json[];
    rows.forEach((row) => { row['headline'] = headline; });
    return JSON.stringify(index);
}

const shown = (view: Mounted): string => text(view.render());
const backoff = (view: Mounted): void => { view.cx.advance(30_000); };
const docs = (api: FakeApi): number => api.calls.filter((call) => call.path === DOC_PATH).length;

beforeEach(() => { reset(); storage.map.clear(); client.api.forget(); fleet(); live = []; views = []; });

afterEach(async () => {
    await Promise.all(views.map((view) => view.close()));
    await Promise.all(live.map((api) => api.stop()));
});

test('the daemon-down notice follows the API: it appears when the API dies mid-session and goes when it answers again', async () => {
    const first = await serve();
    first.advertise();
    const view = await brief();
    await until(() => first.holds.length === 1);
    assert.ok(!shown(view).includes(DOWN));
    await first.stop();
    await until(() => shown(view).includes(DOWN), 'the down notice');
    assert.ok(shown(view).includes('Restart'));
    const second = await serve();
    second.advertise();
    backoff(view);
    await until(() => !shown(view).includes(DOWN), 'the notice gone');
    await until(() => second.holds.length === 1);
});

test('the daemon-down notice also follows a vanished api.json', async () => {
    const api = await serve();
    api.advertise();
    const view = await brief();
    await until(() => api.holds.length === 1);
    await api.stop();
    world.files.delete(`${GUI_DIR}/api.json`);
    await until(() => shown(view).includes(DOWN), 'the down notice');
});

test('in pure file mode, where the API was never seen, there is no down notice', async () => {
    const view = await brief();
    backoff(view);
    await settleSlow();
    assert.ok(!shown(view).includes(DOWN));
});

test('health is asked without the token, and the token only goes to the daemon that api.json names', async () => {
    const api = await serve();
    api.advertise();
    await brief();
    await until(() => api.holds.length === 1);
    assert.deepEqual(api.calls.slice(0, 1).map((call) => [call.path, call.auth]), [[HEALTH, '']]);
    assert.ok(api.calls.filter((call) => call.path !== HEALTH).every((call) => call.auth === `Bearer ${api.token}`));
});

test('an api.json whose pid or startedAt is not the answering daemon is stale: no token is sent, and the mod reads it again later', async () => {
    const impostor = await serve();
    impostor.advertise(impostor.token, { pid: impostor.pid + 1 });
    const view = await brief();
    await settleSlow();
    assert.deepEqual(impostor.calls.filter((call) => call.path !== HEALTH), []);
    assert.ok(impostor.calls.every((call) => call.auth === ''));
    impostor.advertise(impostor.token, { startedAt: impostor.startedAt + 1 });
    backoff(view);
    await settleSlow();
    assert.ok(impostor.calls.every((call) => call.auth === ''));
    assert.equal(impostor.holds.length, 0);
    impostor.advertise();
    backoff(view);
    await until(() => impostor.holds.length === 1, 'the API once api.json is right');
});

test('a daemon that is not what api.json says never gets the commands either', async () => {
    const impostor = await serve();
    impostor.advertise(impostor.token, { pid: impostor.pid + 1 });
    const commands = await loadGui<{ touchMarker(tab: string): Promise<void> }>('commands.js');
    await commands.touchMarker(SHOP);
    assert.ok(impostor.calls.every((call) => call.auth === ''));
    assert.deepEqual(impostor.calls.filter((call) => call.method !== 'GET'), []);
});

test('an events answer from another epoch resets the feed even when the seq looks fine', async () => {
    const api = await serve();
    api.advertise();
    api.index = served('Before the restart');
    const view = await brief();
    await until(() => api.holds.length === 1 && docs(api) === 1);
    api.index = served('After the restart');
    api.epoch += 1;
    api.publish('notice');
    await until(() => shown(view).includes('After the restart') || api.count('/v1/index') > 1, 'the index refetched');
    await until(() => docs(api) === 2, 'the document refetched');
    await until(() => api.holds.length === 1);
    const asked = api.calls.filter((call) => call.path.startsWith('/v1/events')).map((call) => call.path);
    assert.equal(asked.at(-1), `/v1/events?since=${api.seq}&wait=25`);
});

test('the same epoch with a plain notice event refetches nothing', async () => {
    const api = await serve();
    api.advertise();
    await brief();
    await until(() => api.holds.length === 1 && docs(api) === 1);
    api.publish('notice');
    await until(() => api.holds.length === 1 && api.count('/v1/events') === 2);
    assert.equal(docs(api), 1);
    assert.equal(api.count('/v1/index'), 1);
});

test('a strip runs no long-poll and no watcher of its own, and still shows the rows the chip shares', async () => {
    const api = await serve();
    api.advertise();
    const strip = await mount({ role: 'strip', pane: 'w1:p1' });
    views.push(strip);
    await settleSlow();
    strip.cx.advance(120_000);
    await settleSlow();
    assert.equal(api.count('/v1/events'), 0);
    assert.equal(api.holds.length, 0);
    assert.equal(world.watchWaiters.length, 0);
});

test('a strip without the API reads the files without watching them, and one chip holds the only long-poll', async () => {
    world.panes = [{ pane: 'w1:p1', tab: 'w1:t1', terminal: 'w1:p1', title: 'claude', status: 'blocked' }];
    const strip = await mount({ role: 'strip', pane: 'w1:p1' });
    views.push(strip);
    await settleSlow();
    assert.equal(world.watchWaiters.length, 0);
    assert.match(text(strip.render()), /./);
    const api = await serve();
    api.advertise();
    const chip = await mount({ role: 'chip' });
    views.push(chip);
    const more = await mount({ role: 'strip', pane: 'w1:p2' });
    views.push(more);
    await settleSlow();
    backoff(chip);
    await until(() => api.holds.length === 1, 'the chip long-poll');
    await settleSlow();
    assert.equal(api.holds.length, 1);
});

test('six strips, one chip and one window hold exactly two long-polls: the chip and the window', async () => {
    const api = await serve();
    api.advertise();
    const strips = await Promise.all(['w1:p1', 'w1:p2', 'w1:p3', 'w1:p4', 'w1:p5', 'w1:p6'].map((pane) => mount({ role: 'strip', pane })));
    views.push(...strips);
    views.push(await mount({ role: 'chip' }));
    views.push(await mount({ role: 'fleet' }));
    await until(() => api.holds.length === 2, 'two held long-polls');
    await settleSlow();
    strips.forEach((strip) => { strip.cx.advance(120_000); });
    await settleSlow();
    assert.equal(api.holds.length, 2);
    assert.equal(api.count('/v1/events'), 2);
});

test('a daemon that is replaced on the same port mid-session never gets the token again', async () => {
    const api = await serve();
    api.advertise();
    await brief();
    await until(() => api.holds.length === 1 && docs(api) === 1 && api.count('/v1/tabs/w1%3At1/open') === 1);
    await settleSlow();
    api.pid += 1;
    const before = api.calls.length;
    api.publish('index');
    await settleSlow();
    await until(() => api.calls.length > before + 1, 'the mod to notice');
    assert.ok(api.calls.slice(before).every((call) => call.auth === ''));
    assert.equal(api.holds.length, 0);
});

test('a role closed while it is still starting never opens a long-poll afterwards', async () => {
    const api = await serve();
    api.advertise();
    world.props = { role: 'chip' };
    const loaded = await loadGui<ModuleOf<Role>>('main.js');
    const mod = new loaded.default();
    const cx = makeCx();
    mod.init(null, cx);
    await mod.close(cx);
    for (let round = 0; round < 40; round += 1) await settleSlow();
    assert.equal(api.count('/v1/events'), 0);
});

test('a failed ensure does not show the down notice while the API answers', async () => {
    const api = await serve();
    api.advertise();
    world.execReply = (_command, argv): { code: number; stdout: string; stderr: string } | null => (argv[0] === 'ensure' ? { code: 1, stdout: '', stderr: '' } : null);
    const view = await brief();
    await until(() => api.holds.length === 1);
    await settleSlow();
    assert.ok(!shown(view).includes(DOWN));
});
