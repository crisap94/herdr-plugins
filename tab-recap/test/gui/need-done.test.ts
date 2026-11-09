import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { build, fleet, FACTS, install, asV1, patchDoc, SHOP as SHOP_SPEC, BLOG, OPS, DOCS } from './support/fixture.ts';
import type { FakeApi, Route } from './support/fake-api.ts';
import { DARK, reset, world } from './support/herdr.ts';
import { loadGui, storage } from './support/register.ts';
import { Session, SHOP, SHOP_PATH, live, sees, waitFor, words } from './support/serve.ts';
import { all, byId, callsOf, click, hasCall, iconsOf, idsOf, press, text, walk } from './support/tree.ts';
import { dataOf } from './support/kit.ts';

const ANSWER = `${SHOP_PATH}/needs/n1/answer`;
const client = await loadGui<{ api: { forget(): void } }>('api.js');
const session = new Session();

beforeEach(() => { reset(); storage.map.clear(); client.api.forget(); fleet(); });
afterEach(async () => { await session.end(); });

const brief = (): ReturnType<Session['open']> => session.open({ role: 'brief', tab: SHOP });

async function ready(): Promise<{ api: FakeApi; view: Awaited<ReturnType<typeof brief>> }> {
    const api = await session.serve();
    const view = await brief();
    await waitFor(() => live(view, 'mark-0'), 'a live Mark done button');
    return { api, view };
}

const idsIn = (node: Parameters<typeof walk>[0]): string[] => walk(node).flatMap((child) => dataOf(child).id ?? []);

const posts = (api: FakeApi): string[] => api.calls.filter((call) => call.method === 'POST' && call.path.endsWith('/answer')).map((call) => call.path);

test('an open need with a fact id gets a quiet Mark done next to Jump to lane, before Reply and Send', async () => {
    const { view } = await ready();
    const card = byId(view.render(), 'mark-0');
    assert.match(text(card), /Mark done/);
    assert.ok(iconsOf(card).some((path) => path.endsWith('done.svg')));
    assert.deepEqual(callsOf(card, 'bg'), [[DARK['raised']]]);
    const order = walk(view.render()).flatMap((node) => dataOf(node).id ?? []).filter((id) => ['jump', 'mark-0', 'reply', 'send'].includes(id));
    assert.deepEqual(order, ['jump', 'mark-0', 'reply', 'send']);
    assert.equal(sees(view, 'mark-confirm-0'), false);
});

test('Jump to lane and Mark done share a row and Reply and Send get their own, so nothing overflows the card', async () => {
    const { view } = await ready();
    const rows = all(view.render(), () => true).map(idsIn);
    assert.ok(rows.some((ids) => ids.includes('jump') && ids.includes('mark-0') && !ids.includes('reply') && !ids.includes('send') && ids.length <= 4));
    assert.ok(rows.some((ids) => ids.includes('reply') && ids.includes('send') && !ids.includes('jump') && !ids.includes('mark-0') && ids.length <= 3));
});

test('the pending button keeps full contrast: it is busy, not dimmed like a disabled one', async () => {
    const { api, view } = await ready();
    api.answerDelay = 150;
    click(byId(view.render(), 'mark-0'), view.cx);
    click(byId(view.render(), 'mark-yes-0'), view.cx);
    const yes = byId(view.render(), 'mark-yes-0');
    assert.deepEqual(callsOf(yes, 'opacity'), []);
    assert.equal(live(view, 'mark-yes-0'), false);
    assert.deepEqual(callsOf(byId(view.render(), 'mark-no-0'), 'opacity'), [[0.5]]);
    await waitFor(() => api.answered.length === 1, 'the answer to land');
});

test('a version 1 document has no ids, so the button is hidden and the rest of the card is as before', async () => {
    asV1(SHOP);
    patchDoc(SHOP, (doc) => { (doc['tasks'] as { sections: { needs: string[] } }[])[0]!.sections.needs = ['Which effort should the curator default to']; });
    const view = await session.open({ role: 'brief', tab: SHOP });
    assert.match(text(view.render()), /Which effort should the curator default to/);
    assert.equal(sees(view, 'mark-0'), false);
    assert.equal(sees(view, 'jump'), true);
    assert.equal(sees(view, 'reply'), true);
});

test('with the API down the button is disabled and says it needs the daemon API', async () => {
    const view = await brief();
    const tip = byId(view.render(), 'mark-0-tip');
    assert.ok(hasCall(tip, 'tooltip'));
    assert.deepEqual(callsOf(tip, 'tooltip'), [['needs the daemon API']]);
    assert.equal(live(view, 'mark-0'), false);
    assert.deepEqual(callsOf(byId(view.render(), 'mark-0'), 'opacity'), [[0.5]]);
});

test('a click swaps the actions for a confirm row with the warning, Mark as done and Cancel', async () => {
    const { api, view } = await ready();
    click(byId(view.render(), 'mark-0'), view.cx);
    const tree = view.render();
    assert.match(words(view, 'mark-confirm-0'), /closes the need for the terminal UI too\. It cannot be undone from here\./);
    assert.match(text(byId(tree, 'mark-yes-0')), /Mark as done/);
    assert.match(text(byId(tree, 'mark-no-0')), /Cancel/);
    assert.deepEqual(['jump', 'mark-0', 'reply', 'send'].map((id) => sees(view, id)), [false, false, false, false]);
    assert.deepEqual(posts(api), []);
});

test('Cancel puts the actions back and sends nothing', async () => {
    const { api, view } = await ready();
    click(byId(view.render(), 'mark-0'), view.cx);
    click(byId(view.render(), 'mark-no-0'), view.cx);
    assert.equal(sees(view, 'mark-confirm-0'), false);
    assert.equal(live(view, 'mark-0'), true);
    assert.equal(sees(view, 'jump'), true);
    assert.deepEqual(posts(api), []);
});

test('confirming shows a disabled spinning button while the answer is out, and a second click sends nothing more', async () => {
    const { api, view } = await ready();
    api.answerDelay = 150;
    click(byId(view.render(), 'mark-0'), view.cx);
    click(byId(view.render(), 'mark-yes-0'), view.cx);
    const tree = view.render();
    const yes = byId(tree, 'mark-yes-0');
    assert.match(text(yes), /Marking done/);
    assert.equal(live(view, 'mark-yes-0'), false);
    assert.equal(live(view, 'mark-no-0'), false);
    assert.ok(all(yes, (data) => data.calls.some((call) => call.name === 'spin' && call.args[0] === 1000)).length > 0);
    assert.deepEqual(callsOf(byId(tree, 'mark-yes-0-tip'), 'tooltip'), [['waiting for the daemon']]);
    await waitFor(() => posts(api).length === 1, 'the answer');
    await waitFor(() => api.answered.length === 1, 'the answer to land');
    assert.equal(posts(api).length, 1);
});

test('success posts the fact id, shows the toast, refetches the tab and the closed need leaves the card', async () => {
    const { api, view } = await ready();
    click(byId(view.render(), 'mark-0'), view.cx);
    click(byId(view.render(), 'mark-yes-0'), view.cx);
    await waitFor(() => world.notices.length === 1, 'the toast');
    assert.deepEqual(posts(api), [ANSWER]);
    assert.equal(api.calls.find((call) => call.path === ANSWER)?.auth, `Bearer ${api.token}`);
    assert.equal(world.notices[0]?.title, 'Marked as done');
    assert.equal(world.noticeSpecs[0]?.['level'], 'success');
    await waitFor(() => !sees(view, 'mark-0') && !sees(view, 'mark-confirm-0'), 'the need to leave');
    assert.doesNotMatch(text(view.render()), /Which effort should the curator default to/);
});

test('success refetches the tab on its own even when the daemon publishes nothing', async () => {
    const { api, view } = await ready();
    api.closeOnAnswer = false;
    const before = api.calls.filter((call) => call.path === SHOP_PATH).length;
    click(byId(view.render(), 'mark-0'), view.cx);
    click(byId(view.render(), 'mark-yes-0'), view.cx);
    await waitFor(() => world.notices.length === 1, 'the toast');
    await waitFor(() => api.calls.filter((call) => call.path === SHOP_PATH).length > before, 'the refetch');
    const index = api.calls.findIndex((call) => call.path === ANSWER);
    assert.ok(api.calls.slice(index + 1).some((call) => call.path === SHOP_PATH));
    await waitFor(() => live(view, 'mark-0'), 'the card to be idle again');
    assert.equal(sees(view, 'mark-confirm-0'), false);
});

test('after a success the card keeps its spinner until the refetch lands, so no live Mark done sits on a closed need', async () => {
    const { api, view } = await ready();
    api.closeOnAnswer = false;
    api.slowDocs.push({ body: api.tabs.get(SHOP) ?? '', ms: 300 });
    click(byId(view.render(), 'mark-0'), view.cx);
    click(byId(view.render(), 'mark-yes-0'), view.cx);
    await waitFor(() => world.notices.length === 1, 'the toast');
    assert.equal(live(view, 'mark-0'), false);
    assert.equal(sees(view, 'mark-confirm-0'), true);
    assert.equal(world.notices.length, 1);
    await waitFor(() => live(view, 'mark-0'), 'the refetch to land');
    assert.equal(posts(api).length, 1);
});

test('an answer that lands after the user left and came back neither clears nor breaks the new confirmation', async () => {
    const { api, view } = await ready();
    api.answerDelay = 200;
    api.closeOnAnswer = false;
    click(byId(view.render(), 'mark-0'), view.cx);
    click(byId(view.render(), 'mark-yes-0'), view.cx);
    press(view.render(), 'escape', view.cx);
    press(view.render(), 'enter', view.cx);
    await waitFor(() => live(view, 'mark-0'), 'the brief to be back');
    click(byId(view.render(), 'mark-0'), view.cx);
    await waitFor(() => api.answered.length === 1 && world.notices.length === 1, 'the old answer to land');
    await new Promise<void>((done) => { setTimeout(done, 100); });
    assert.equal(sees(view, 'mark-confirm-0'), true);
    assert.equal(world.notices.length, 1);
    assert.equal(posts(api).length, 1);
});

const FAILURES: [number, string, string][] = [
    [404, 'unknown-tab', 'That tab is gone'],
    [404, 'unknown-need', 'That need is gone'],
    [409, 'not-open', 'Already closed'],
    [409, 'not-a-need', 'Not a need'],
    [429, 'rate-limited', 'Too many requests'],
    [401, 'unauthorized', 'The daemon is not reachable'],
    [500, 'broken', 'The daemon could not do that'],
];

for (const [status, error, wording] of FAILURES) {
    test(`a ${status} ${error} shows "${wording}" inline in the error colour, no toast, and the button works again`, async () => {
        const { api, view } = await ready();
        api.failing['answer' satisfies Route] = { status, error };
        click(byId(view.render(), 'mark-0'), view.cx);
        click(byId(view.render(), 'mark-yes-0'), view.cx);
        await waitFor(() => sees(view, 'mark-error-0'), 'the error line');
        const line = byId(view.render(), 'mark-error-0');
        assert.equal(text(line), wording);
        assert.deepEqual(callsOf(line, 'text_color'), [[DARK['blocked']]]);
        assert.equal(world.notices.length, 0);
        assert.equal(live(view, 'mark-0'), true);
        assert.equal(sees(view, 'mark-confirm-0'), false);
        api.failing['answer'] = null;
        click(byId(view.render(), 'mark-0'), view.cx);
        assert.equal(sees(view, 'mark-error-0'), false);
        assert.equal(sees(view, 'mark-confirm-0'), true);
    });
}

test('a daemon that goes away between the click and the answer shows that it is not reachable', async () => {
    const { api, view } = await ready();
    click(byId(view.render(), 'mark-0'), view.cx);
    await session.stop(api);
    click(byId(view.render(), 'mark-yes-0'), view.cx);
    await waitFor(() => sees(view, 'mark-error-0'), 'the error line');
    assert.equal(text(byId(view.render(), 'mark-error-0')), 'The daemon is not reachable');
    assert.equal(world.notices.length, 0);
});

test('leaving the brief forgets a half-made confirmation', async () => {
    const { view } = await ready();
    click(byId(view.render(), 'mark-0'), view.cx);
    assert.equal(sees(view, 'mark-confirm-0'), true);
    press(view.render(), 'escape', view.cx);
    press(view.render(), 'enter', view.cx);
    await waitFor(() => live(view, 'mark-0'), 'the brief to be back');
    assert.equal(sees(view, 'mark-confirm-0'), false);
});

test('a second need gets its own Mark done, with no Jump, Reply or Send of its own', async () => {
    const extra = { id: 'n2', section: 'needs' as const, text: 'Which region should it deploy to', minutesAgo: 5 };
    install([build({ ...SHOP_SPEC, facts: [...FACTS, extra] }), build(BLOG), build(OPS), build(DOCS)]);
    const { api, view } = await ready();
    await waitFor(() => sees(view, 'mark-1'), 'the second card');
    assert.equal(idsOf(view.render(), 'jump').length, 1);
    click(byId(view.render(), 'mark-1'), view.cx);
    assert.equal(sees(view, 'mark-confirm-1'), true);
    assert.equal(sees(view, 'mark-confirm-0'), false);
    click(byId(view.render(), 'mark-yes-1'), view.cx);
    await waitFor(() => api.answered.length === 1, 'the answer');
    assert.match(api.answered[0] ?? '', /:n(1|2)$/);
});

const tabReads = (api: FakeApi): number => api.calls.filter((call) => call.method === 'GET' && call.path === SHOP_PATH).length;

test('an answer the daemon processed but whose reply was lost is not sent twice and the card goes without an error', async () => {
    const { api, view } = await ready();
    api.dropAfterAnswer = true;
    const before = tabReads(api);
    click(byId(view.render(), 'mark-0'), view.cx);
    click(byId(view.render(), 'mark-yes-0'), view.cx);
    await waitFor(() => api.answered.length === 1 && !sees(view, 'mark-0'), 'the card to go');
    await waitFor(() => tabReads(api) >= before + 2, 'the event read and the check read');
    assert.equal(posts(api).length, 1);
    assert.equal(sees(view, 'mark-error-0'), false);
    assert.doesNotMatch(text(view.render()), /Already closed/);
    assert.equal(world.notices.length, 0);
});

test('an answer lost before the daemon saw it is not sent twice, shows not reachable and reads the tab again', async () => {
    const { api, view } = await ready();
    api.dropPosts = true;
    const before = tabReads(api);
    click(byId(view.render(), 'mark-0'), view.cx);
    click(byId(view.render(), 'mark-yes-0'), view.cx);
    await waitFor(() => sees(view, 'mark-error-0'), 'the error line');
    assert.equal(text(byId(view.render(), 'mark-error-0')), 'The daemon is not reachable');
    assert.equal(posts(api).length, 1);
    assert.deepEqual(api.answered, []);
    assert.ok(tabReads(api) > before);
    assert.equal(live(view, 'mark-0'), true);
});

test('a 401 on the answer is sent again once and the need is marked done', async () => {
    const { api, view } = await ready();
    api.unauthorizedNext = 1;
    click(byId(view.render(), 'mark-0'), view.cx);
    click(byId(view.render(), 'mark-yes-0'), view.cx);
    await waitFor(() => world.notices.length === 1, 'the toast');
    assert.equal(posts(api).length, 2);
    assert.equal(api.answered.length, 1);
    assert.equal(sees(view, 'mark-error-0'), false);
});
