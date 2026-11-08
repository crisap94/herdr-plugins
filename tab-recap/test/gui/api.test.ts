import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Commands } from './support/api.ts';
import { FakeApi, until } from './support/fake-api.ts';
import { GUI_DIR, reset, world } from './support/herdr.ts';
import { docPath as docPathOf, fleet, readJson, type Json } from './support/fixture.ts';
import { mount, type Mounted } from './support/mount.ts';
import { loadGui, settle, storage } from './support/register.ts';
import { maybe, press, text } from './support/tree.ts';

interface Forgetful {
    api: { forget(): void };
}

const client = await loadGui<Forgetful>('api.js');
const commands = await loadGui<Commands>('commands.js');
const TAB = 'w1:t2';
const FROM_FILES = 'Drafting posts';
const FROM_API = 'Headline served by the API';
const SHOP = 'w1:t1';
const DOC_PATH = '/v1/tabs/w1%3At1';
const OPEN_PATH = '/v1/tabs/w1%3At1/open';

let live: FakeApi[] = [];
let views: Mounted[] = [];

async function serve(): Promise<FakeApi> {
    const api = await FakeApi.start();
    live.push(api);
    return api;
}

function served(headline: string): string {
    const index = readJson(`${GUI_DIR}/index.json`);
    const rows = (Array.isArray(index['tabs']) ? index['tabs'] : []) as Json[];
    rows.filter((row) => row['tab'] === TAB).forEach((row) => { row['headline'] = headline; });
    return JSON.stringify(index);
}

async function open(role: Record<string, unknown> = { role: 'fleet' }): Promise<Mounted> {
    const view = await mount(role);
    views.push(view);
    return view;
}

const row = (view: Mounted): string => {
    const node = maybe(view.render(), (data) => data.id === `row-${TAB}`);
    return node === null ? '' : text(node);
};
const shows = (view: Mounted, words: string): Promise<void> => until(() => row(view).includes(words), words);
const parked = (): number => world.watchWaiters.length;
const backoff = (view: Mounted): void => { view.cx.advance(30_000); };

beforeEach(() => { reset(); storage.map.clear(); client.api.forget(); fleet(); live = []; views = []; });

afterEach(async () => {
    await Promise.all(views.map((view) => view.close()));
    await Promise.all(live.map((api) => api.stop()));
});

test('with the API up the rows come from it, the files are not watched, and the bearer token is sent', async () => {
    const api = await serve();
    api.index = served(FROM_API);
    api.advertise();
    const view = await open();
    await shows(view, FROM_API);
    assert.equal(parked(), 0);
    const authed = api.calls.filter((call) => call.path !== '/v1/health');
    assert.ok(authed.length > 0 && authed.every((call) => call.auth === `Bearer ${api.token}`));
    await until(() => api.holds.length === 1, 'a held long-poll');
    assert.match(api.calls.at(-1)?.path ?? '', /^\/v1\/events\?since=0&wait=25$/);
});

test('an index event refetches the index', async () => {
    const api = await serve();
    api.advertise();
    const view = await open();
    await until(() => api.holds.length === 1);
    await shows(view, FROM_FILES);
    api.index = served(FROM_API);
    api.publish('index');
    await shows(view, FROM_API);
    await until(() => api.holds.length === 1);
    assert.equal(api.count('/v1/index'), 2);
});

test('a tab event refetches the tracked document and ignores other tabs', async () => {
    const api = await serve();
    api.advertise();
    await open({ role: 'brief', tab: SHOP });
    const docs = (): number => api.calls.filter((call) => call.path === DOC_PATH).length;
    await until(() => docs() === 1 && api.holds.length === 1);
    api.publish('tab', 'w1:t3');
    await until(() => api.holds.length === 1 && api.count('/v1/events') === 2);
    assert.equal(docs(), 1);
    api.publish('tab', SHOP);
    await until(() => docs() === 2);
    assert.equal(api.count('/v1/index'), 1);
});

test('a reset answer refetches everything', async () => {
    const api = await serve();
    api.advertise();
    const view = await open();
    await until(() => api.holds.length === 1);
    api.index = served(FROM_API);
    api.resetNext = true;
    api.publish('notice');
    await shows(view, FROM_API);
});

test('with no api.json the files are read and watched', async () => {
    const view = await open();
    await shows(view, FROM_FILES);
    assert.equal(parked(), 1);
});

test('a garbage api.json, a wrong token and a broken server all mean the API is down', async () => {
    world.files.set(`${GUI_DIR}/api.json`, '{"version":1,"port":"x"}');
    await shows(await open(), FROM_FILES);
    reset();
    fleet();
    const api = await serve();
    api.advertise('0'.repeat(64));
    await shows(await open(), FROM_FILES);
    reset();
    fleet();
    api.advertise();
    api.status = 500;
    await shows(await open(), FROM_FILES);
});

test('the API appearing after start takes over from the files', async () => {
    const view = await open();
    assert.equal(parked(), 1);
    const api = await serve();
    api.index = served(FROM_API);
    api.advertise();
    backoff(view);
    await shows(view, FROM_API);
    await until(() => api.holds.length === 1);
});

test('the API dying mid-session falls back to the files, and coming back switches again', async () => {
    const first = await serve();
    first.index = served(FROM_API);
    first.advertise();
    const view = await open();
    await until(() => first.holds.length === 1);
    await first.stop();
    world.files.delete(`${GUI_DIR}/api.json`);
    await shows(view, FROM_FILES);
    await until(() => parked() === 1);
    const second = await serve();
    second.index = served('Back on the API');
    second.advertise();
    backoff(view);
    await shows(view, 'Back on the API');
    await until(() => second.holds.length === 1);
    assert.equal(parked(), 1);
});

test('a daemon restart with a new port and token is picked up without leaving API mode', async () => {
    const first = await serve();
    first.advertise();
    const view = await open();
    await until(() => first.holds.length === 1);
    const second = await serve();
    second.index = served('After the restart');
    second.advertise();
    await first.stop();
    await shows(view, 'After the restart');
    await until(() => second.holds.length === 1);
    assert.equal(parked(), 0);
    assert.notEqual(first.token, second.token);
});

test('closing the window ends the long-poll loop and nothing is left running', async () => {
    const api = await serve();
    api.advertise();
    const view = await open();
    await until(() => api.holds.length === 1);
    const asked = api.count('/v1/events');
    await view.close();
    api.publish('index');
    await settle();
    await until(() => api.holds.length === 0);
    view.cx.advance(120_000);
    await settle();
    assert.equal(api.count('/v1/events'), asked);
    assert.equal(api.holds.length, 0);
});

test('closing a window that fell back to the files ends the retries too', async () => {
    const view = await open();
    await view.close();
    const api = await serve();
    api.advertise();
    backoff(view);
    await settle();
    assert.equal(api.calls.length, 0);
});

test('with the API up the commands use it and exec nothing', async () => {
    const api = await serve();
    api.advertise();
    await commands.touchMarker(SHOP);
    await commands.clearMarker(SHOP);
    await commands.refreshTab(SHOP);
    assert.deepEqual(api.calls.filter((call) => call.path !== '/v1/health').map((call) => `${call.method} ${call.path}`), [`PUT ${OPEN_PATH}`, `DELETE ${OPEN_PATH}`, 'POST /v1/tabs/w1%3At1/refresh']);
    assert.deepEqual(world.execLog.filter((call) => call.command !== 'printenv'), []);
});

test('a brief uses the lease and refresh through the API', async () => {
    const api = await serve();
    api.advertise();
    const view = await open({ role: 'brief', tab: SHOP });
    await until(() => api.count(OPEN_PATH) === 1);
    press(view.render(), 'r', view.cx);
    await until(() => api.count('/v1/tabs/w1%3At1/refresh') === 1);
    press(view.render(), 'escape', view.cx);
    await until(() => api.calls.some((call) => call.method === 'DELETE'));
    assert.deepEqual(world.execLog.filter((call) => ['touch', 'rm', 'tab-recap-desktop'].includes(call.command) && call.argv[0] !== 'ensure'), []);
});

test('with the API down the commands exec as before', async () => {
    await commands.touchMarker(SHOP);
    await commands.clearMarker(SHOP);
    await commands.refreshTab(SHOP);
    const used = world.execLog.filter((call) => call.command !== 'printenv').map((call) => call.command);
    assert.deepEqual(used, ['touch', 'rm', 'tab-recap-desktop']);
});

test('a lease given through the API is released through the file when the API died meanwhile', async () => {
    const api = await serve();
    api.advertise();
    await commands.touchMarker(SHOP);
    await api.stop();
    world.files.delete(`${GUI_DIR}/api.json`);
    client.api.forget();
    await commands.touchMarker(SHOP);
    await commands.clearMarker(SHOP);
    assert.deepEqual(world.execLog.filter((call) => call.command === 'rm').length, 1);
});

test('a broken events route with a healthy daemon is retried with a pause, not in a tight loop', async () => {
    const api = await serve();
    api.eventsStatus = 500;
    api.advertise();
    await open();
    await new Promise<void>((resume) => { setTimeout(resume, 400); });
    assert.ok(api.count('/v1/events') <= 3, `${api.count('/v1/events')} event polls in 400ms`);
});

test('an older document answer arriving late never replaces a newer one', async () => {
    const api = await serve();
    const fresh = world.files.get(docPathOf(SHOP)) ?? '';
    api.tabs.set(SHOP, fresh);
    api.slowDocs.push({ body: fresh.replace('Running the tests', 'STALE WORDS'), ms: 300 });
    api.advertise();
    const view = await open({ role: 'brief', tab: SHOP });
    const docs = (): number => api.calls.filter((call) => call.path === DOC_PATH).length;
    await until(() => docs() === 1 && api.holds.length === 1);
    api.publish('tab', SHOP);
    await until(() => docs() === 2);
    await new Promise<void>((resume) => { setTimeout(resume, 500); });
    const shown = text(view.render());
    assert.ok(!shown.includes('STALE WORDS'));
});
