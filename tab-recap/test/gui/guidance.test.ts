import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type { FakeApi } from './support/fake-api.ts';
import { fleet } from './support/fixture.ts';
import { DARK, reset } from './support/herdr.ts';
import { dataOf } from './support/kit.ts';
import type { Mounted } from './support/mount.ts';
import { loadGui, storage } from './support/register.ts';
import { Session, SHOP, sees, waitFor, words } from './support/serve.ts';
import { all, byId, callsOf, click, hasCall, hasHandler, inputState, mouseDown, text } from './support/tree.ts';

const client = await loadGui<{ api: { forget(): void } }>('api.js');
const session = new Session();
const ONE = [{ terminal: 'w1:p1', name: 'lane w1:p1', status: 'blocked' }];
const TWO = [...ONE, { terminal: 'w1:p2', name: 'lane w1:p2', status: 'working' }];
const THREE = [...TWO, { terminal: 'w1:p3', name: 'lane w1:p3', status: 'idle' }];
const PATH = `/v1/tabs/w1%3At1/compact-message?pane=w1%3Ap1&note=`;
const CAPTION = 'Engine guidance, no model call';

beforeEach(() => { reset(); storage.map.clear(); client.api.forget(); fleet(); });
afterEach(async () => { await session.end(); });

const popup = (lanes = TWO): Promise<Mounted> => session.open({
    role: 'compact', name: 'lane w1:p1', pct: 50, window: 200_000, hint: 40, overlay: 'pop-1', tab: SHOP, terminal: 'w1:p1', lanes,
});

const asks = (api: FakeApi, route = 'compact-message'): string[] => api.calls.filter((call) => call.path.includes(route)).map((call) => call.path);
const noteOf = (path: string): string => decodeURIComponent(path.split('note=')[1] ?? '');
const shows = (view: Mounted, part: string): Promise<void> => waitFor(() => words(view, 'guide-text').includes(part), part);
const type = (view: Mounted, value: string): void => {
    const note = inputState(view.render(), 'compact');
    note.set_value(value);
    note.fire('change', view.cx);
};
const blur = (view: Mounted): void => { inputState(view.render(), 'compact').fire('blur', view.cx); };
const press = (view: Mounted, id: string): void => { click(byId(view.render(), id), view.cx); };
const label = (view: Mounted, id: string): string => text(byId(view.render(), id));
const enabled = (view: Mounted, id: string): boolean => hasHandler(byId(view.render(), id), 'on_click');

async function ready(lanes = TWO): Promise<{ api: FakeApi; view: Mounted }> {
    const api = await session.serve();
    const view = await popup(lanes);
    await shows(view, 'Guidance for w1:p1');
    return { api, view };
}

test('opening the popup shows a loading line, then the engine text with its caption', async () => {
    const api = await session.serve();
    const view = await popup();
    assert.match(words(view, 'guide-text'), /Loading the message/);
    assert.equal(enabled(view, 'copy-tip') || enabled(view, 'copy'), false);
    await shows(view, 'Guidance for w1:p1: ');
    assert.equal(words(view, 'guide-caption'), CAPTION);
    assert.deepEqual(asks(api), [PATH]);
    assert.match(text(view.render()), /Compact message/i);
    assert.equal(enabled(view, 'copy'), true);
});

test('the new text uses the muted role, not the dim one, so it keeps 4.5:1 contrast on the raised popup', async () => {
    const api = await session.serve();
    const view = await popup();
    const dim = DARK['dim'];
    assert.deepEqual(callsOf(byId(view.render(), 'guide-text'), 'text_color').at(-1), [DARK['muted']]);
    await shows(view, 'Guidance for w1:p1: ');
    assert.deepEqual(callsOf(byId(view.render(), 'guide-caption'), 'text_color'), [[DARK['muted']]]);
    const heads = all(byId(view.render(), 'guidance'), (data) => data.calls.some((call) => call.name === 'text_color' && call.args[0] === dim));
    assert.equal(heads.length, 0);
    assert.ok(asks(api).length > 0);
});

test('Copy keeps one width before and after it turns into Copied, so Copy handoff does not move', async () => {
    const { view } = await ready();
    assert.deepEqual(callsOf(byId(view.render(), 'copy'), 'min_w'), [[76]]);
    press(view, 'copy');
    assert.equal(label(view, 'copy'), 'Copied');
    assert.deepEqual(callsOf(byId(view.render(), 'copy'), 'min_w'), [[76]]);
});

test('Compact itself stays disabled and Cancel still closes the popup', async () => {
    const { view } = await ready();
    assert.equal(hasHandler(byId(view.render(), 'go'), 'on_click'), false);
    assert.ok(hasCall(byId(view.render(), 'go-tip'), 'tooltip'));
});

test('a note change fetches after 500 ms, not before, and the text follows the note', async () => {
    const { api, view } = await ready();
    type(view, 'keep the schema');
    view.cx.advance(499);
    assert.equal(asks(api).length, 1);
    view.cx.advance(1);
    await shows(view, 'Guidance for w1:p1: keep the schema');
    assert.deepEqual(asks(api).map(noteOf), ['', 'keep the schema']);
});

test('a burst of keystrokes sends one request for the last note', async () => {
    const { api, view } = await ready();
    for (const value of ['a', 'ab', 'abc', 'abcd', 'abcde']) {
        type(view, value);
        view.cx.advance(100);
    }
    view.cx.advance(500);
    await shows(view, 'Guidance for w1:p1: abcde');
    assert.deepEqual(asks(api).map(noteOf), ['', 'abcde']);
});

test('leaving the field fetches at once and the pending timer adds nothing', async () => {
    const { api, view } = await ready();
    type(view, 'now');
    blur(view);
    await shows(view, 'Guidance for w1:p1: now');
    view.cx.advance(500);
    await new Promise<void>((done) => { setImmediate(done); });
    assert.deepEqual(asks(api).map(noteOf), ['', 'now']);
});

test('only one request is in flight and the latest note wins over a slower older answer', async () => {
    const { api, view } = await ready();
    api.slowCompact = [100, 100];
    type(view, 'a');
    view.cx.advance(500);
    await waitFor(() => api.inflight === 1, 'the first request');
    type(view, 'ab');
    blur(view);
    await waitFor(() => asks(api).length === 3, 'the newer request');
    assert.doesNotMatch(words(view, 'guide-text'), /p1: a\b/);
    assert.match(words(view, 'guide-text'), /Loading the message/);
    await shows(view, 'Guidance for w1:p1: ab');
    assert.equal(api.peak, 1);
    assert.deepEqual(asks(api).map(noteOf), ['', 'a', 'ab']);
});

test('a note longer than 280 is clipped before it is sent and the counter follows', async () => {
    const { api, view } = await ready();
    type(view, 'x'.repeat(300));
    blur(view);
    await waitFor(() => asks(api).length === 2, 'the request');
    assert.equal(noteOf(asks(api)[1] ?? '').length, 280);
    assert.match(text(view.render()), /280 \/ 280/);
});

test('a message over the limit is shown whole, with no error line, and can be copied whole', async () => {
    const api = await session.serve();
    const long = `${'x'.repeat(3000)}\nend of the message`;
    api.compactText = (): string => long;
    const view = await popup();
    await waitFor(() => words(view, 'guide-text').includes('end of the message'), 'the whole message');
    assert.ok(words(view, 'guide-text').includes('x'.repeat(3000)));
    assert.doesNotMatch(text(view.render()), /over the|Shorten|limit/);
    assert.equal(all(byId(view.render(), 'guide-text'), (d) => d.calls.some((c) => c.name === 'text_color' && c.args[0] === DARK['blocked'])).length, 0);
    assert.equal(enabled(view, 'copy'), true);
    press(view, 'copy');
    assert.deepEqual(view.cx.clipboard, [long]);
});

test('a note of emoji is clipped and counted by code points, never through the middle of one', async () => {
    const { api, view } = await ready();
    type(view, '\u{1F600}'.repeat(300));
    blur(view);
    await waitFor(() => asks(api).length === 2, 'the request');
    const sent = noteOf(asks(api)[1] ?? '');
    assert.equal(Array.from(sent).length, 280);
    assert.equal(sent, '\u{1F600}'.repeat(280));
    assert.match(text(view.render()), /280 \/ 280/);
});

test('280 emoji are 280 and fit, while the 281st is dropped', async () => {
    const { api, view } = await ready();
    type(view, '\u{1F600}'.repeat(280));
    blur(view);
    await waitFor(() => asks(api).length === 2, 'the request');
    assert.equal(Array.from(noteOf(asks(api)[1] ?? '')).length, 280);
    assert.match(text(view.render()), /280 \/ 280/);
    type(view, `${'\u{1F600}'.repeat(280)}\u{1F600}`);
    assert.equal(Array.from(inputState(view.render(), 'compact').value()).length, 280);
});

test('a note the daemon calls too long says so in the error colour and shows no text of the note', async () => {
    const { api, view } = await ready();
    api.failing.compact = { status: 400, error: 'note-too-long' };
    type(view, 'a note');
    blur(view);
    await waitFor(() => words(view, 'guide-text') === 'The note is too long', 'the line');
    const line = byId(view.render(), 'guide-text');
    assert.deepEqual(callsOf(line, 'text_color').at(-1), [DARK['blocked']]);
    assert.equal(enabled(view, 'copy'), false);
});

test('an unknown tab and a down daemon are each drawn as one plain line with Copy disabled', async () => {
    const api = await session.serve();
    api.failing.compact = { status: 404, error: 'unknown-tab' };
    const view = await popup();
    await waitFor(() => words(view, 'guide-text') === 'That tab is gone', 'the error');
    assert.ok(hasCall(byId(view.render(), 'copy-tip'), 'tooltip'));
    const down = await popup();
    await session.stop(api);
    blur(down);
    type(down, 'again');
    blur(down);
    await waitFor(() => words(down, 'guide-text') === 'The daemon is not reachable', 'the daemon error');
});

test('with no daemon at all the popup says so and a later blur tries again', async () => {
    const view = await popup();
    await waitFor(() => words(view, 'guide-text') === 'The daemon is not reachable', 'the error');
    const api = await session.serve();
    blur(view);
    await shows(view, 'Guidance for w1:p1');
    assert.ok(asks(api).length >= 1);
});

test('a rate limit and a rejected note read plainly', async () => {
    const api = await session.serve();
    api.failing.compact = { status: 429, error: 'rate-limited' };
    const view = await popup();
    await waitFor(() => words(view, 'guide-text') === 'Too many requests', 'the limit');
    api.failing.compact = { status: 400, error: 'bad-request' };
    blur(view);
    await waitFor(() => words(view, 'guide-text') === 'The daemon did not accept that', 'the rejection');
});

test('a pane the daemon no longer knows reads as a gone lane, and a gone tab as a gone tab', async () => {
    const api = await session.serve();
    api.failing.compact = { status: 404, error: 'unknown-pane' };
    const view = await popup();
    await waitFor(() => words(view, 'guide-text') === 'That lane is gone', 'the lane line');
    assert.equal(enabled(view, 'copy'), false);
    api.failing.compact = { status: 404, error: 'unknown-tab' };
    blur(view);
    type(view, 'again');
    blur(view);
    await waitFor(() => words(view, 'guide-text') === 'That tab is gone', 'the tab line');
});

test('Copy writes exactly the message, shows Copied for two seconds, then goes back to Copy', async () => {
    const api = await session.serve();
    const body = 'First line\n\nSecond `line` with _marks_ and a tab\t.';
    api.compactText = (): string => body;
    const view = await popup();
    await waitFor(() => enabled(view, 'copy'), 'Copy to be live');
    assert.equal(label(view, 'copy'), 'Copy');
    press(view, 'copy');
    assert.deepEqual(view.cx.clipboard, [body]);
    assert.equal(label(view, 'copy'), 'Copied');
    view.cx.advance(1999);
    assert.equal(label(view, 'copy'), 'Copied');
    view.cx.advance(1);
    assert.equal(label(view, 'copy'), 'Copy');
});

test('a clipboard that throws shows the failure line and a selectable text view of the message', async () => {
    const { view } = await ready();
    view.cx.clipboardBroken = true;
    press(view, 'copy');
    assert.equal(words(view, 'copy-failed'), 'Copy failed, select the text');
    assert.equal(label(view, 'copy'), 'Copy');
    const shown = all(view.render(), (data) => data.kind === 'TextView');
    assert.equal(shown.length, 1);
    const node = shown[0];
    assert.ok(node !== undefined);
    assert.match(String(dataOf(node).extra.get('markdown')), /Guidance for w1:p1: /);
    assert.ok(callsOf(node, 'selectable').length === 1);
    assert.deepEqual(view.cx.clipboard, []);
});

test('a new message replaces the fallback text view', async () => {
    const { view } = await ready();
    view.cx.clipboardBroken = true;
    press(view, 'copy');
    assert.equal(all(view.render(), (data) => data.kind === 'TextView').length, 1);
    type(view, 'next');
    blur(view);
    await shows(view, 'Guidance for w1:p1: next');
    assert.equal(all(view.render(), (data) => data.kind === 'TextView').length, 0);
    assert.equal(all(view.render(), (data) => data.id === 'copy-failed').length, 0);
});

test('a runtime without write_to_clipboard takes the same fallback', async () => {
    const { view } = await ready();
    Reflect.deleteProperty(view.cx, 'write_to_clipboard');
    press(view, 'copy');
    assert.equal(words(view, 'copy-failed'), 'Copy failed, select the text');
});

test('with one lane Copy handoff is disabled and says it needs a second lane', async () => {
    const { view } = await ready(ONE);
    const tip = byId(view.render(), 'copy-handoff-tip');
    assert.deepEqual(callsOf(tip, 'tooltip'), [['needs a second lane']]);
    assert.equal(enabled(view, 'copy-handoff'), false);
});

test('with two lanes Copy handoff fetches the handoff to the other lane and copies it', async () => {
    const { api, view } = await ready(TWO);
    assert.equal(all(view.render(), (data) => data.id === 'handoff-pick').length, 0);
    press(view, 'copy-handoff');
    await waitFor(() => view.cx.clipboard.length === 1, 'the copy');
    assert.deepEqual(view.cx.clipboard, ['Handoff from w1:p1 to w1:p2']);
    assert.deepEqual(asks(api, 'handoff-message'), ['/v1/tabs/w1%3At1/handoff-message?from=w1%3Ap1&to=w1%3Ap2']);
    assert.equal(label(view, 'copy-handoff'), 'Copied');
    assert.equal(label(view, 'copy'), 'Copy');
    view.cx.advance(2000);
    assert.equal(label(view, 'copy-handoff'), 'Copy handoff');
});

test('with three lanes a picker of the other lanes chooses the target', async () => {
    const { api, view } = await ready(THREE);
    assert.deepEqual(callsOf(byId(view.render(), 'pick-0'), 'border_color'), [[DARK['accent']]]);
    assert.deepEqual(callsOf(byId(view.render(), 'pick-1'), 'border_color'), [[DARK['border']]]);
    assert.match(text(byId(view.render(), 'handoff-pick')), /Hand off to/);
    click(byId(view.render(), 'pick-1'), view.cx);
    assert.deepEqual(callsOf(byId(view.render(), 'pick-1'), 'border_color'), [[DARK['accent']]]);
    press(view, 'copy-handoff');
    await waitFor(() => view.cx.clipboard.length === 1, 'the copy');
    assert.deepEqual(view.cx.clipboard, ['Handoff from w1:p1 to w1:p3']);
    assert.deepEqual(asks(api, 'handoff-message'), ['/v1/tabs/w1%3At1/handoff-message?from=w1%3Ap1&to=w1%3Ap3']);
});

test('a slow handoff for a lane the user has since left never overwrites the clipboard after the newer one', async () => {
    const { api, view } = await ready(THREE);
    api.slowHandoff = [200, 0];
    press(view, 'copy-handoff');
    await waitFor(() => asks(api, 'handoff-message').length === 1, 'the first handoff');
    click(byId(view.render(), 'pick-1'), view.cx);
    press(view, 'copy-handoff');
    await waitFor(() => view.cx.clipboard.length === 1, 'the newer copy');
    await new Promise<void>((done) => { setTimeout(done, 300); });
    assert.deepEqual(view.cx.clipboard, ['Handoff from w1:p1 to w1:p3']);
    assert.equal(label(view, 'copy-handoff'), 'Copied');
});

test('a note that cannot be encoded fails that one request and the popup keeps answering', async () => {
    const { api, view } = await ready();
    type(view, 'a\ud83d');
    blur(view);
    await waitFor(() => words(view, 'guide-text') !== '' && !/Loading/.test(words(view, 'guide-text')), 'the popup to settle');
    type(view, 'ok');
    blur(view);
    await shows(view, 'Guidance for w1:p1: ok');
    assert.equal(noteOf(asks(api).at(-1) ?? ''), 'ok');
});

test('a failed handoff fetch shows a plain line and copies nothing', async () => {
    const { api, view } = await ready(TWO);
    api.failing.handoff = { status: 404, error: 'unknown-tab' };
    press(view, 'copy-handoff');
    await waitFor(() => words(view, 'handoff-error') !== '', 'the error');
    assert.equal(words(view, 'handoff-error'), 'That tab is gone');
    assert.deepEqual(view.cx.clipboard, []);
    assert.equal(enabled(view, 'copy-handoff'), true);
});

test('a handoff to a lane that is gone reads That lane is gone and copies nothing', async () => {
    const { api, view } = await ready(TWO);
    api.failing.handoff = { status: 404, error: 'unknown-pane' };
    press(view, 'copy-handoff');
    await waitFor(() => words(view, 'handoff-error') !== '', 'the error');
    assert.equal(words(view, 'handoff-error'), 'That lane is gone');
    assert.deepEqual(view.cx.clipboard, []);
});

test('a refused handoff shows the daemon detail in the error colour, clipped, and copies nothing', async () => {
    const { api, view } = await ready(TWO);
    api.failing.handoff = { status: 409, error: 'handoff-refused', detail: 'the lane has no session yet' };
    press(view, 'copy-handoff');
    await waitFor(() => words(view, 'handoff-error') !== '', 'the error');
    const line = byId(view.render(), 'handoff-error');
    assert.equal(text(line), 'the lane has no session yet');
    assert.deepEqual(callsOf(line, 'text_color'), [[DARK['blocked']]]);
    assert.deepEqual(view.cx.clipboard, []);
    assert.equal(enabled(view, 'copy-handoff'), true);
});

test('a known refusal code is shown as a sentence and an unknown code as itself', async () => {
    const { api, view } = await ready(TWO);
    api.failing.handoff = { status: 409, error: 'handoff-refused', detail: 'ledger-empty' };
    press(view, 'copy-handoff');
    await waitFor(() => words(view, 'handoff-error') !== '', 'the error');
    assert.equal(words(view, 'handoff-error'), 'The recap has no facts yet, so there is nothing to hand off');
    api.failing.handoff = { status: 409, error: 'handoff-refused', detail: 'status-not-ready' };
    press(view, 'copy-handoff');
    await waitFor(() => words(view, 'handoff-error') === 'status-not-ready', 'the raw code');
});

test('a very long refusal detail is clipped to two lines of text with an ellipsis', async () => {
    const { api, view } = await ready(TWO);
    api.failing.handoff = { status: 409, error: 'handoff-refused', detail: 'reason '.repeat(80) };
    press(view, 'copy-handoff');
    await waitFor(() => words(view, 'handoff-error') !== '', 'the error');
    const shown = words(view, 'handoff-error');
    assert.ok(Array.from(shown).length <= 91, `${shown.length} characters`);
    assert.match(shown, /\u2026$/);
});

test('a refusal without a detail falls back to a plain line', async () => {
    const { api, view } = await ready(TWO);
    api.failing.handoff = { status: 409, error: 'handoff-refused' };
    press(view, 'copy-handoff');
    await waitFor(() => words(view, 'handoff-error') !== '', 'the error');
    assert.equal(words(view, 'handoff-error'), 'The daemon could not do that');
});

test('a brief with a lane chip and no popup asks nothing, and a closed popup stops fetching', async () => {
    const api = await session.serve();
    const brief = await session.open({ role: 'brief', tab: SHOP });
    await waitFor(() => asks(api, '/v1/tabs/w1%3At1').length > 0, 'the brief to load');
    await waitFor(() => sees(brief, 'lane-0'), 'the lane chip');
    mouseDown(byId(brief.render(), 'lane-0'), brief.cx);
    await new Promise<void>((done) => { setTimeout(done, 50); });
    assert.deepEqual(asks(api, '-message'), []);
    const view = await popup();
    await shows(view, 'Guidance for w1:p1');
    type(view, 'late');
    await view.close();
    view.cx.advance(500);
    await new Promise<void>((done) => { setTimeout(done, 50); });
    assert.equal(asks(api, 'compact-message').length, 1);
});
