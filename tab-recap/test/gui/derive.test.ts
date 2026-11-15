import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Derive, Event, Keys, Seen, Timeline } from './support/api.ts';
import { loadGui, storage } from './support/register.ts';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-11-08T12:00:00Z');
const derive = await loadGui<Derive>('derive.js');
const timeline = await loadGui<Timeline>('derive-timeline.js');
const seen = await loadGui<Seen>('seen.js');
const keys = await loadGui<Keys>('keys.js');

const named = (name: string, status: string, waitingSince: number | null = null): { name: string; status: string; waitingSince: number | null } => ({ name, status, waitingSince });
const at = (hoursAgo: number, sec: string, text = 'e'): Event => ({ t: NOW - hoursAgo * HOUR, sec, text });

test('urgency puts blocked first, then done, working, idle, and unknown last', () => {
    const rows = [named('a', 'idle'), named('b', 'unknown'), named('c', 'working'), named('d', 'done'), named('e', 'blocked')];
    assert.deepEqual(derive.byUrgency(rows).map((row) => row.status), ['blocked', 'done', 'working', 'idle', 'unknown']);
});

test('within a status the longest wait comes first, a row that never waited after, then the name', () => {
    const rows = [named('z', 'blocked'), named('b', 'blocked', 500), named('a', 'blocked', 900), named('c', 'blocked', 500)];
    assert.deepEqual(derive.byUrgency(rows).map((row) => row.name), ['b', 'c', 'a', 'z']);
});

test('byUrgency does not reorder its input', () => {
    const rows = [named('a', 'idle'), named('b', 'blocked')];
    derive.byUrgency(rows);
    assert.deepEqual(rows.map((row) => row.name), ['a', 'b']);
});

test('visible filters by status set and searches name, space and headline case-insensitively', () => {
    const rows = [
        { ...named('shop', 'blocked'), space: 'work', headline: 'Need the API key' },
        { ...named('blog', 'working'), space: 'home', headline: 'writing posts' },
        { ...named('api', 'idle'), space: 'work', headline: '' },
    ];
    assert.deepEqual(derive.visible(rows, new Set(['working', 'idle']), '').map((row) => row.name), ['blog', 'api']);
    assert.deepEqual(derive.visible(rows, new Set(), '  API ').map((row) => row.name), ['shop', 'api']);
    assert.deepEqual(derive.visible(rows, new Set(), 'home').map((row) => row.name), ['blog']);
    assert.deepEqual(derive.visible(rows, new Set(['idle']), 'shop'), []);
});

test('context, hint and need helpers', () => {
    assert.equal(derive.maxCtx({ contextPercent: 30, lanes: [{ contextPercent: 90 }] }), 30);
    assert.equal(derive.maxCtx({ contextPercent: null, lanes: [{ contextPercent: 20 }, { contextPercent: 70 }, { contextPercent: null }] }), 70);
    assert.equal(derive.maxCtx({ contextPercent: null, lanes: [] }), null);
    assert.equal(derive.hintOf({ hintPercent: null }), 40);
    assert.equal(derive.hintOf({ hintPercent: 55 }), 55);
    assert.equal(derive.needsYou({ needs: 0, status: 'blocked' }), true);
    assert.equal(derive.needsYou({ needs: 2, status: 'working' }), true);
    assert.equal(derive.needsYou({ needs: 0, status: 'working' }), false);
});

test('the worst status of a set follows the urgency order and falls back to idle', () => {
    assert.equal(derive.worstOf([named('a', 'working'), named('b', 'done')]), 'done');
    assert.equal(derive.worstOf([named('a', 'working'), named('b', 'blocked')]), 'blocked');
    assert.equal(derive.worstOf([]), 'idle');
});

test('waitMinutes rounds to minutes and is zero without a wait', () => {
    assert.equal(derive.waitMinutes({ waitingSince: NOW - 25 * 60_000 }, NOW), 25);
    assert.equal(derive.waitMinutes({ waitingSince: null }, NOW), 0);
    assert.equal(derive.waitMinutes({ waitingSince: NOW + 60_000 }, NOW), 0);
});

const states = (stage: string): string[] => derive.stepsOf({ stage, stageAt: NOW - 5000 }, NOW).map((step) => step.state);

test('a stage record maps to four steps: finished, current and waiting', () => {
    assert.deepEqual(states('briefing'), ['now', 'idle', 'idle', 'idle']);
    assert.deepEqual(states('compacting'), ['ok', 'now', 'idle', 'idle']);
    assert.deepEqual(states('restoring'), ['ok', 'ok', 'now', 'idle']);
    assert.deepEqual(states('compacted'), ['ok', 'ok', 'ok', 'ok']);
    assert.deepEqual(states('failed'), ['idle', 'idle', 'idle', 'idle']);
    assert.deepEqual(states('unconfirmed'), ['idle', 'idle', 'idle', 'idle']);
    assert.deepEqual(states('skipped'), ['idle', 'idle', 'idle', 'idle']);
});

test('only the current step carries elapsed seconds, and a finished run carries the time it took', () => {
    const running = derive.stepsOf({ stage: 'compacting', stageAt: NOW - 12_400 }, NOW);
    assert.deepEqual(running.map((step) => step.secs), [null, 12, null, null]);
    const done = derive.stepsOf({ stage: 'compacted', stageAt: NOW - 60_000, tookMs: 41_000 }, NOW);
    assert.deepEqual(done.map((step) => step.secs), [null, null, null, 41]);
    assert.deepEqual(derive.stepsOf({ stage: 'briefing', stageAt: NOW + 9000 }, NOW).map((step) => step.secs), [0, null, null, null]);
});

test('binning: the window is 48 hours in 32 bins of 90 minutes, edges are half-open', () => {
    const made = timeline.bins([], NOW);
    assert.equal(made.bins.length, 32);
    assert.equal(made.from, NOW - 48 * HOUR);
    assert.equal((made.bins[0]?.t1 ?? 0) - (made.bins[0]?.t0 ?? 0), 1.5 * HOUR);
    const from = NOW - 48 * HOUR;
    const edge = timeline.bins([{ t: from, sec: 'done', text: 'a' }, { t: from + 1.5 * HOUR - 1, sec: 'done', text: 'b' }, { t: from + 1.5 * HOUR, sec: 'done', text: 'c' }], NOW);
    assert.deepEqual(edge.bins.slice(0, 3).map((bin) => bin.n), [2, 1, 0]);
});

test('binning: an event at now lands in the last bin and an older one is counted but not plotted', () => {
    const made = timeline.bins([{ t: NOW, sec: 'done', text: 'now' }, at(48.01, 'done'), at(100, 'needs')], NOW);
    assert.equal(made.bins[31]?.n, 1);
    assert.equal(made.older, 2);
    assert.equal(made.bins.reduce((sum, bin) => sum + bin.n, 0), 1);
});

test('the dominant section of a bin is the most frequent, a tie goes to the earlier section, an empty bin to needs', () => {
    const made = timeline.bins([at(1, 'done'), at(1, 'done'), at(1, 'progress'), at(1, 'decisions'), at(10, 'done'), at(10, 'decisions'), at(20, 'progress')], NOW);
    const dominant = (hoursAgo: number): string | undefined => made.bins.find((bin) => bin.t0 <= NOW - hoursAgo * HOUR && NOW - hoursAgo * HOUR < bin.t1)?.dominant;
    assert.equal(dominant(1), 'done');
    assert.equal(dominant(10), 'decisions');
    assert.equal(dominant(20), 'progress');
    assert.equal(dominant(30), 'needs');
});

test('the feed is newest first, grouped under day separators in the document zone, and breaks show only unfiltered', () => {
    const events: Event[] = [at(1, 'done', 'late'), at(30, 'needs', 'early'), at(2, 'progress', 'mid')];
    const breaks = [{ t: NOW - 3 * HOUR, kind: 'compaction', text: 'compacted' }];
    const none = { sections: new Set<string>(), q: '', bin: null };
    const full = timeline.feed(events, breaks, none, 'UTC');
    assert.deepEqual(full.rows.map((row) => row.type), ['day', 'event', 'event', 'break', 'day', 'event']);
    assert.equal(full.count, 3);
    assert.match(full.rows[0]?.label ?? '', /^Nov 8 \(Sun\)$/);
    assert.match(full.rows[4]?.label ?? '', /^Nov 7 \(Sat\)$/);
    const filtered = timeline.feed(events, breaks, { ...none, sections: new Set(['done']) }, 'UTC');
    assert.deepEqual(filtered.rows.map((row) => row.type), ['day', 'event']);
    const searched = timeline.feed(events, breaks, { ...none, q: 'mid' }, 'UTC');
    assert.equal(searched.count, 1);
});

test('the day label follows the host-local clock', () => {
    const events: Event[] = [{ t: Date.parse('2026-11-08T01:30:00Z'), sec: 'done', text: 'x' }];
    const none = { sections: new Set<string>(), q: '', bin: null };
    assert.match(timeline.feed(events, [], none, 'UTC').rows[0]?.label ?? '', /^Nov 8/);
    assert.match(timeline.feed(events, [], none, 'America/Los_Angeles').rows[0]?.label ?? '', /^Nov 8/);
});

test('a chosen bin keeps events inside [t0, t1) only', () => {
    const made = timeline.bins([at(1, 'done', 'in'), at(5, 'done', 'out')], NOW);
    const bin = made.bins.find((one) => one.n > 0 && one.events[0]?.text === 'in') ?? null;
    const out = timeline.feed(made.bins.flatMap((one) => one.events), [], { sections: new Set(), q: '', bin }, 'UTC');
    assert.equal(out.count, 1);
});

const FACT = (section: string, firstAt: number, state = 'open'): { section: string; firstAt: number; state: string } => ({ section, firstAt, state });
const doc = { breaks: [{ kind: 'compacted', at: 500 }, { kind: 'compacted', at: 50 }, { kind: 'switched', at: 600 }], tasks: [{ facts: [FACT('needs', 200), FACT('needs', 200, 'closed'), FACT('needs', 50), FACT('decisions', 300), FACT('now', 400), FACT('done', 450), FACT('done', 10), FACT('next', 900)] }, { facts: [FACT('decisions', 120)] }] };

test('since you last looked counts what is newer than the stored time, per kind', () => {
    assert.deepEqual(seen.since(doc, 100), { seen: 100, need: 1, dec: 2, fact: 2, comp: 1 });
    assert.deepEqual(seen.since(doc, 1000), { seen: 1000, need: 0, dec: 0, fact: 0, comp: 0 });
});

test('a v1 document, which has no breaks, and a missing document read as nothing new', () => {
    assert.deepEqual(seen.since({ tasks: [] }, 5), { seen: 5, need: 0, dec: 0, fact: 0, comp: 0 });
    assert.deepEqual(seen.since(null, 5), { seen: 5, need: 0, dec: 0, fact: 0, comp: 0 });
});

test('a tab without a stored time was last seen a day ago, and markSeen keeps the other tabs', () => {
    storage.map.clear();
    assert.equal(seen.lastSeen('t1', NOW), NOW - 24 * HOUR);
    seen.markSeen('t1', 111);
    seen.markSeen('t2', 222);
    assert.equal(seen.lastSeen('t1', NOW), 111);
    assert.equal(seen.lastSeen('t2', NOW), 222);
    assert.equal(seen.lastSeen('t3', NOW), NOW - 24 * HOUR);
});

test('corrupt stored data is ignored and then overwritten', () => {
    for (const bad of ['not json', 'null', '5', '"x"', '{"t1":"soon"}']) {
        storage.map.set('tab-recap.seen', bad);
        assert.equal(seen.lastSeen('t1', NOW), NOW - 24 * HOUR, bad);
    }
    storage.map.set('tab-recap.seen', 'not json');
    seen.markSeen('t1', 7);
    assert.equal(seen.lastSeen('t1', NOW), 7);
});

test('unavailable storage never throws', () => {
    storage.broken = true;
    try {
        assert.equal(seen.lastSeen('t1', NOW), NOW - 24 * HOUR);
        assert.doesNotThrow(() => { seen.markSeen('t1', 1); });
    } finally {
        storage.broken = false;
    }
});

test('a missing localStorage global never throws either', () => {
    const held = Reflect.get(globalThis, 'localStorage');
    Reflect.deleteProperty(globalThis, 'localStorage');
    try {
        assert.equal(seen.lastSeen('t1', NOW), NOW - 24 * HOUR);
        assert.doesNotThrow(() => { seen.markSeen('t1', 1); });
    } finally {
        Reflect.set(globalThis, 'localStorage', held);
    }
});

test('keys map to actions, ignore modifiers and ignore everything while typing', () => {
    const map: [string, string][] = [['j', 'down'], ['k', 'up'], ['enter', 'open'], ['/', 'search'], ['c', 'compact'], ['r', 'refresh'], ['escape', 'back']];
    for (const [key, action] of map) {
        assert.deepEqual(keys.keyAction({ key }, false), { action, arg: null }, key);
        assert.equal(keys.keyAction({ key }, true), null, key);
    }
    assert.deepEqual(keys.keyAction({ key: '3' }, false), { action: 'view', arg: 2 });
    assert.equal(keys.keyAction({ key: '5' }, false), null);
    assert.equal(keys.keyAction({ key: 'j', modifiers: { control: true } }, false), null);
    assert.equal(keys.keyAction({ key: 'j', modifiers: { shift: true } }, false)?.action, 'down');
});
