import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GuiPublisher } from '#src/adapters/gui-publisher.ts';
import { must } from '#src/protocol/result.ts';
import { guiIndexRow } from '#src/recap/application/gui-index-build.ts';
import { guiTabOf } from '#src/recap/application/gui-tab-build.ts';
import { BLANK_READS } from '#src/recap/application/gui-tab-reads.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parseDirectory, type Directory } from '#src/recap/domain/directory.ts';
import { HEADLINE_MAX, INDEX_LANES_MAX, encodeGuiTab, parseGuiIndex, type GuiLane, type GuiTab, type GuiTask } from '#src/recap/domain/gui-tab.ts';
import type { GuiFact } from '#src/recap/domain/gui-tab-parts.ts';
import { agentKind, paneId, tabId } from '#src/recap/domain/ids.ts';
import { parseNonEmptyText, parseText, type NonEmptyText, type Text } from '#src/recap/domain/text.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { blankRecap, type RecapRecords, type TabRecap } from '#src/ports/recap-records.ts';
import type { TabView, TabViews } from '#src/ports/tab-views.ts';
import { must as present } from '#test/db/support.ts';
import { v2Problems } from '#test/gui-schema-support.ts';

const text = (raw: string): Text => must(parseText(raw));
const count = (raw: number): Count => must(parseCount(raw));
const named = (raw: string): NonEmptyText => must(parseNonEmptyText(raw));

const base = guiTabOf(blankRecap('w1:t1'), null, instant(1000));

const laneOf = (pane: string, status: string, over: Partial<GuiLane> = {}): GuiLane => ({
    pane: paneId(pane), agent: agentKind('claude'), status: must(parseNonEmptyText(status)), title: null, cwd: null, lastPrompt: null, branch: null, contextPercent: null, since: null,
    heading: text(`lane ${pane}`), fromScreen: 'no', context: null, compaction: { hint: null, stage: null }, notes: [], git: null, web: null, ...over,
});

const factOf = (id: string, content: string, firstAt: number, state: 'open' | 'closed' = 'open'): GuiFact => ({
    id: must(parseNonEmptyText(id)), section: 'needs', text: text(content), spans: null, why: null, ref: null, agent: null,
    firstAt: instant(firstAt), lastAt: instant(firstAt), state, closedWhy: null, closedAt: null,
});

const ids = (list: string[] | undefined): NonEmptyText[] => (list ?? []).map(named);

const taskOf = (over: { facts?: GuiFact[]; needs?: string[]; now?: string[]; sectionNeeds?: string[]; sectionNow?: string[] }): GuiTask => {
    const empty = { goal: text(''), now: [], needs: [], done: [], decisions: [], next: [], links: [], rules: [] };
    return {
        id: must(parseNonEmptyText('t1')), name: text('Task'), markdown: text(''), curating: 'no', needsWaitedMs: [], story: null, timeline: [], facts: over.facts ?? [],
        sections: { ...empty, needs: (over.sectionNeeds ?? []).map(text), now: (over.sectionNow ?? []).map(text) },
        regions: { goal: [], now: ids(over.now), needs: ids(over.needs), decisions: [], next: [], rules: [], links: [] },
    };
};

const tabWith = (tasks: GuiTask[], lanes: GuiLane[], over: Partial<GuiTab> = {}): GuiTab => ({ ...base, tasks, lanes, ...over });

test('the headline is the open need that has waited longest', () => {
    const task = taskOf({ facts: [factOf('n1', 'newer need', 500), factOf('n2', 'older need', 100), factOf('n3', 'closed need', 10, 'closed')], needs: ['n1', 'n2', 'n3'] });
    const row = guiIndexRow(tabWith([task], [laneOf('p1', 'working')]));
    assert.equal(row.headline, 'older need');
    assert.equal(row.needs, 2);
    assert.equal(row.waitingSince, 100);
});

test('a task without facts offers sections.needs[0] as the headline and counts its needs', () => {
    const row = guiIndexRow(tabWith([taskOf({ sectionNeeds: ['first ask', 'second ask'], sectionNow: ['busy'] })], []));
    assert.equal(row.headline, 'first ask');
    assert.equal(row.needs, 2);
    assert.equal(row.waitingSince, null);
});

test('without needs the NOW line wins, from facts first and then from sections', () => {
    const now = { ...factOf('w1', 'running tests', 5), section: 'now' as const };
    const fromFacts = guiIndexRow(tabWith([taskOf({ facts: [now], now: ['w1'], sectionNow: ['ignored'] })], [laneOf('p1', 'idle')]));
    assert.equal(fromFacts.headline, 'running tests');
    assert.equal(fromFacts.needs, 0);
    const fromSections = guiIndexRow(tabWith([taskOf({ sectionNow: ['section now'] })], [laneOf('p1', 'idle')]));
    assert.equal(fromSections.headline, 'section now');
});

test('without needs or now the headline is the heading of the most urgent lane, then empty', () => {
    const lanes = [laneOf('p1', 'idle', { heading: text('idle one') }), laneOf('p2', 'working', { heading: text('busy one') }), laneOf('p3', 'blocked', { heading: text('stuck one') })];
    assert.equal(guiIndexRow(tabWith([], lanes)).headline, 'stuck one');
    assert.equal(guiIndexRow(tabWith([], [])).headline, '');
});

test('the headline is flattened and clipped within its limit with a final ellipsis', () => {
    const long = `first   line\n${'word '.repeat(80)}`;
    const row = guiIndexRow(tabWith([taskOf({ sectionNeeds: [long] })], []));
    assert.ok(row.headline.length <= HEADLINE_MAX);
    assert.ok(row.headline.endsWith('…'));
    assert.ok(row.headline.startsWith('first line word'));
});

test('waitingSince falls back to the oldest blocked lane, and is null otherwise', () => {
    const lanes = [laneOf('p1', 'blocked', { since: instant(300) }), laneOf('p2', 'blocked', { since: instant(200) }), laneOf('p3', 'working', { since: instant(1) })];
    assert.equal(guiIndexRow(tabWith([], lanes)).waitingSince, 200);
    assert.equal(guiIndexRow(tabWith([], [laneOf('p3', 'working', { since: instant(1) })])).waitingSince, null);
});

test('contextPercent is the highest lane value, null when no lane knows one', () => {
    const lanes = [laneOf('p1', 'idle', { contextPercent: count(31) }), laneOf('p2', 'idle'), laneOf('p3', 'idle', { contextPercent: count(72) })];
    assert.equal(guiIndexRow(tabWith([], lanes)).contextPercent, 72);
    assert.equal(guiIndexRow(tabWith([], [laneOf('p2', 'idle')])).contextPercent, null);
});

test('lane rows are in urgency order, capped, and laneCount is the uncapped count', () => {
    const statuses = ['idle', 'working', 'done', 'blocked', 'unknown', 'idle', 'working', 'done', 'blocked', 'idle'];
    const lanes = statuses.map((status, at) => laneOf(`p${at}`, status));
    const row = guiIndexRow(tabWith([], lanes));
    assert.equal(row.laneCount, 10);
    assert.equal(row.lanes.length, INDEX_LANES_MAX);
    assert.deepEqual(row.lanes.map((lane) => lane.status), ['blocked', 'blocked', 'done', 'done', 'working', 'working', 'idle', 'idle']);
    assert.deepEqual(row.lanes.slice(0, 2).map((lane) => lane.terminal), ['p3', 'p8']);
});

test('a lane row carries the hint flag, the stage and the clipped name', () => {
    const stage = { id: must(parseNonEmptyText('c1')), stage: 'compacting' as const, queued: 'no' as const, writer: null, brief: null, why: null, startedAt: instant(1), stageAt: instant(2), tokensBefore: null, tokensAfter: null, tookMs: null, origin: 'operator' as const, text: text('') };
    const lane = laneOf('p1', 'working', { heading: text('n'.repeat(200)), compaction: { hint: { percent: count(40), window: count(200000) }, stage } });
    const row = present(guiIndexRow(tabWith([], [lane, laneOf('p2', 'idle')])).lanes[0]);
    assert.equal(row.hint, 'yes');
    assert.equal(row.stage, 'compacting');
    assert.equal(row.name.length, 80);
    assert.equal(guiIndexRow(tabWith([], [laneOf('p2', 'idle')])).lanes[0]?.hint, 'no');
});

test('hintPercent, recapAt and writing come from the tab', () => {
    const row = guiIndexRow(tabWith([], [], { compactHint: count(40), recapAt: instant(77), writing: 'writing' }));
    assert.deepEqual([row.hintPercent, row.recapAt, row.writing], [40, 77, 'writing']);
});

test('an old row with only the first four fields still parses with defaults', () => {
    const parsed = parseGuiIndex({ tabs: [{ tab: 'w1:t1', name: 'Login', status: 'idle', at: 5 }] });
    if (parsed.kind === 'err') { throw new Error('index refused'); }
    const old = present(parsed.value[0]);
    assert.deepEqual([old.recapAt, old.writing, old.headline, old.needs, old.waitingSince, old.contextPercent, old.hintPercent, old.laneCount, old.lanes], [null, 'resting', '', 0, null, null, null, 0, []]);
});

test('a malformed lane or count inside a row is dropped or defaulted, never the row', () => {
    const lane = { terminal: 'p1', agent: 'claude', status: 'idle', stage: 'bogus' };
    const parsed = parseGuiIndex({ tabs: [{ tab: 'w1:t2', lanes: [{ nonsense: true }, lane], needs: -1 }] });
    if (parsed.kind === 'err') { throw new Error('index refused'); }
    const odd = present(parsed.value[0]);
    assert.equal(odd.needs, 0);
    assert.deepEqual(odd.lanes.map((each) => [each.terminal, each.hint, each.stage, each.name]), [['p1', 'no', null, '']]);
});

const recordsOf = (recaps: Readonly<Record<string, TabRecap>>): RecapRecords => ({ readRecap: (tab): TabRecap | null => recaps[tab] ?? null }) as RecapRecords;
const viewsOf = (views: Readonly<Record<string, TabView>>): TabViews => ({ readTab: (tab): TabView | null => views[tab] ?? null, writeTab: (): void => undefined, tabOf: (): null => null });
const viewOf = (tab: string): TabView => ({ tab, column: null, at: 5, lanes: [{ pane: `${tab}p1`, agent: 'claude', status: 'blocked', title: 'login', cwd: '/work', since: instant(40) }, { pane: `${tab}p2`, agent: 'codex', status: 'idle', title: null, cwd: null }] });

function publisherOn(dir: Directory, at: number): GuiPublisher {
    const recaps = { a: { ...blankRecap('a'), at: 1 }, b: { ...blankRecap('b'), at: 1 } };
    return new GuiPublisher({ dir, records: recordsOf(recaps), views: viewsOf({ a: viewOf('a'), b: viewOf('b') }), now: (): Instant => instant(at), log: (): void => undefined });
}

type Wire = { version: number; tabs: { tab: string; headline?: string; waitingSince?: number | null; laneCount?: number; lanes?: unknown[] }[] };

test('publishing B keeps every new field of A, the index stays newest first, and old rows get defaults', () => {
    const dir = must(parseDirectory(mkdtempSync(join(tmpdir(), 'gui-index-'))));
    writeFileSync(join(dir, 'index.json'), JSON.stringify({ version: 1, tabs: [{ tab: 'old', name: 'Old', status: 'idle', at: 3 }] }));
    publisherOn(dir, 100).publish(tabId('a'));
    publisherOn(dir, 200).publish(tabId('b'));
    const index: Wire = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
    assert.deepEqual(index.tabs.map((row) => row.tab), ['b', 'a', 'old']);
    const keep = present(index.tabs[1]);
    assert.deepEqual([keep.headline, keep.waitingSince, keep.laneCount, keep.lanes?.length], ['login', 40, 2, 2]);
    assert.equal(present(index.tabs[2]).laneCount, 0);
    assert.equal(index.version, 1);
});

test('the document gains only compactHint, and still matches the v2 schema', () => {
    const document = guiTabOf(blankRecap('w1:t1'), null, instant(9), { ...BLANK_READS, compactHint: count(40) });
    const wire: Record<string, unknown> = JSON.parse(JSON.stringify(document));
    assert.equal(wire['compactHint'], 40);
    assert.equal(wire['version'], 2);
    assert.deepEqual(v2Problems(wire), []);
    assert.deepEqual(v2Problems({ ...wire, compactHint: null }), []);
    const old = { ...wire };
    delete old['compactHint'];
    assert.deepEqual(v2Problems(old), []);
    const encoded = encodeGuiTab(document);
    assert.equal(encoded.kind, 'ok');
});

test('a 200-tab fleet of 8-lane rows stays well under one MiB', () => {
    const lanes = Array.from({ length: 12 }, (_, at) => laneOf(`w1:p${at}`, 'working', { heading: text('h'.repeat(200)), contextPercent: count(50) }));
    const row = guiIndexRow(tabWith([taskOf({ sectionNeeds: ['n'.repeat(400)] })], lanes, { compactHint: count(40) }));
    const bytes = Buffer.byteLength(JSON.stringify({ version: 1, tabs: Array.from({ length: 200 }, () => row) }));
    assert.ok(bytes < 1024 * 1024 / 2, `${bytes} bytes`);
});
