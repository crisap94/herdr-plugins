import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACTS, build, install, live, patchDoc, SHOP, type TabSpec } from './support/fixture.ts';
import { DARK, reset } from './support/herdr.ts';
import { dataOf } from './support/kit.ts';
import { mount } from './support/mount.ts';
import { storage } from './support/register.ts';
import { byId, callsOf, click, find, hasId, idsOf, inputState, press, text, walk } from './support/tree.ts';

const TAB = 'w1:t1';
const HOUR = 3_600_000;
const SPEC: TabSpec = { ...SHOP, facts: [...FACTS, { id: 'x3', section: 'done', text: 'Old milestone', minutesAgo: 40 * 60 }, { id: 'x4', section: 'done', text: 'Ancient', minutesAgo: 60 * 60 }] };

const colors = (node: object, name: string): unknown[] => callsOf(node, name).map((args) => args[0]);
const barColor = (tree: object, id: string): unknown => colors(find(byId(tree, id), (data) => data.calls.some((call) => call.name === 'max_w')), 'bg')[0];

test.beforeEach(() => {
    reset();
    storage.map.clear();
    install([build(SPEC)]);
    live([{ id: TAB, name: 'shop', status: 'blocked' }]);
});

const open = async (): ReturnType<typeof mount> => {
    const view = await mount({ role: 'brief', tab: TAB });
    press(view.render(), '3', view.cx);
    return view;
};

test('the plot has 32 bins and colours each bar by its dominant section', async () => {
    const view = await open();
    const tree = view.render();
    assert.equal(idsOf(tree, 'bin-').length, 32);
    assert.equal(barColor(tree, 'bin-31'), DARK['blocked']);
    assert.equal(barColor(tree, 'bin-25'), DARK['done']);
});

test('bins with no event draw no bar height and the busiest bin gets the tallest', async () => {
    const view = await open();
    const tree = view.render();
    const height = (id: string): unknown => callsOf(find(byId(tree, id), (data) => data.calls.some((call) => call.name === 'max_w')), 'h')[0]?.[0];
    assert.equal(height('bin-0'), 0);
    assert.equal(height('bin-31'), 64);
    assert.ok(Number(height('bin-25')) >= 6);
});

test('clicking a bin filters the feed to its events and offers Clear range', async () => {
    const view = await open();
    assert.equal(hasId(view.render(), 'clear-range'), false);
    const before = idsOf(view.render(), 'feed-').length;
    click(byId(view.render(), 'bin-31'), view.cx);
    const words = text(byId(view.render(), 'feed'));
    assert.match(words, /Running the tests/);
    assert.doesNotMatch(words, /Merged the importer/);
    assert.ok(idsOf(view.render(), 'feed-').length < before);
    assert.ok(hasId(view.render(), 'clear-range'));
    assert.match(text(view.render()), /4 events in /);
    click(byId(view.render(), 'clear-range'), view.cx);
    assert.equal(hasId(view.render(), 'clear-range'), false);
    click(byId(view.render(), 'bin-31'), view.cx);
    click(byId(view.render(), 'bin-31'), view.cx);
    assert.equal(hasId(view.render(), 'clear-range'), false);
});

test('the feed is newest first with a separator for each day on the host clock', async () => {
    const view = await open();
    const feed = byId(view.render(), 'feed');
    const days = dataOf(feed).children.map((child) => (typeof child === 'object' ? text(child) : '')).filter((line) => /^(Nov \d+) \(/.test(line));
    assert.deepEqual(days, ['Nov 8 (Sun)', 'Nov 6 (Fri)']);
    const words = text(feed);
    assert.ok(words.indexOf('Shipped the schema') < words.indexOf('Old milestone'));
});

test('the section buttons filter the feed and show their counts', async () => {
    const view = await open();
    assert.match(text(byId(view.render(), 'sec-done')), /Done\s+4/);
    click(byId(view.render(), 'sec-decisions'), view.cx);
    const words = text(byId(view.render(), 'feed'));
    assert.match(words, /Use sqlite for the ledger/);
    assert.doesNotMatch(words, /Shipped the schema/);
});

test('search narrows the feed to matching text', async () => {
    const view = await open();
    const field = inputState(view.render(), 'tq');
    field.set_value('MILESTONE');
    field.fire('change', view.cx);
    assert.match(text(byId(view.render(), 'feed')), /Old milestone/);
    assert.doesNotMatch(text(byId(view.render(), 'feed')), /Shipped/);
    field.set_value('zzzz');
    field.fire('change', view.cx);
    assert.match(text(byId(view.render(), 'feed')), /No events match/);
});

test('events older than the window are counted in the caption and not plotted', async () => {
    const view = await open();
    assert.match(text(view.render()), /1 older not plotted/);
});

test('axis ticks sit on whole six-hour steps of the host clock and carry a now label', async () => {
    const view = await open();
    const ticks = (): number[] => idsOf(view.render(), 'tick-').filter((id) => id !== 'tick-now').map((id) => Number(id.slice(5)));
    assert.ok(ticks().length >= 7);
    assert.ok(ticks().every((ms) => ms % (6 * HOUR) === 0));
    assert.ok(hasId(view.render(), 'tick-now'));
});

test('midnight ticks are labelled with the day', async () => {
    const view = await open();
    const labels = walk(view.render()).filter((node) => (dataOf(node).id ?? '').startsWith('tick-') && dataOf(node).id !== 'tick-now').map(text);
    assert.ok(labels.includes('12:00'));
    assert.ok(labels.some((label) => /^(Fri|Sat|Sun) Nov \d+$/.test(label)));
});

test('compaction and session breaks draw a dashed mark and a row in the feed, and filters hide the rows', async () => {
    patchDoc(TAB, (doc) => { doc['breaks'] = [{ kind: 'compacted', at: Date.parse('2026-11-08T06:00:00Z'), trigger: null, tokensBefore: null, tokensAfter: null, tookMs: null, text: 'went from 80% to 5%' }]; });
    const view = await open();
    assert.ok(hasId(view.render(), 'mark-0'));
    assert.match(text(byId(view.render(), 'mark-0')), /Compaction/);
    assert.match(text(byId(view.render(), 'feed')), /went from 80% to 5%/);
    click(byId(view.render(), 'sec-done'), view.cx);
    assert.doesNotMatch(text(byId(view.render(), 'feed')), /went from 80%/);
});

test('hovering a bin shows the card with the events of that bin', async () => {
    const view = await open();
    assert.equal(hasId(view.render(), 'hover-card'), false);
    const handler = dataOf(byId(view.render(), 'bin-31')).handlers.get('on_hover');
    handler?.(true, view.cx);
    const card = byId(view.render(), 'hover-card');
    assert.match(text(card), /4 events/);
    assert.match(text(card), /Running the tests/);
    handler?.(false, view.cx);
    assert.equal(hasId(view.render(), 'hover-card'), false);
});

test('the cuts line names a timeline the daemon had to shorten', async () => {
    patchDoc(TAB, (doc) => { doc['cuts'] = [{ part: 'timeline', task: 't1', kept: 200, total: 6000 }]; });
    const view = await mount({ role: 'brief', tab: TAB });
    assert.match(text(byId(view.render(), 'cut-0')), /timeline: showing 200 of 6000/);
});
