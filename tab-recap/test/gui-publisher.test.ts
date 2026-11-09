import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PublishingViews } from '#src/adapters/desktop/publishing-views.ts';
import { GuiPublisher } from '#src/adapters/desktop/publisher.ts';
import { must } from '#src/protocol/result.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import { guiTabOf } from '#src/recap/application/gui-tab-build.ts';
import { TOO_LARGE_ERROR } from '#src/recap/domain/gui-fit.ts';
import { GUI_TAB_LIMIT, encodeGuiTab, guiFileName, worstStatus, type GuiLaneV1, type GuiTab } from '#src/recap/domain/gui-tab.ts';
import { agentKind, paneId, tabId } from '#src/recap/domain/ids.ts';
import { parseNonEmptyText, parseText } from '#src/recap/domain/text.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { blankRecap, type RecapRecords, type TabRecap } from '#src/ports/recap-records.ts';
import type { TabView, TabViews } from '#src/ports/tab-views.ts';
import { v2Problems } from '#test/gui-schema-support.ts';

const wire = (document: GuiTab): unknown => JSON.parse(JSON.stringify(document));

const recapOf = (tab: string, overrides: Partial<TabRecap> = {}): TabRecap => ({
    ...blankRecap(tab), at: 1000, backend: 'custom', ...overrides,
    tasks: [{ id: 't1', name: 'Login page', lanes: ['p1'], markdown: '# Login', sections: { goal: 'Ship the login page', now: ['wiring the form'], needs: [], done: ['route added'], decisions: [], next: ['tests'], links: [], rules: ['secret rule'] } }],
});

const viewOf = (tab: string): TabView => ({
    tab, column: null, at: 5, lanes: [
        { pane: 'p1', agent: 'claude', status: 'working', title: 'login', cwd: '/work' },
        { pane: 'p2', agent: 'codex', status: 'blocked', title: null, cwd: null },
    ],
});

const laneOf = (status: string): GuiLaneV1 => ({ pane: paneId(status), agent: agentKind('claude'), status: must(parseNonEmptyText(status)), title: null, cwd: null, lastPrompt: null, branch: null, contextPercent: null, since: null });

function tabViewsOf(views: Readonly<Record<string, TabView>>): TabViews {
    return { readTab: (tab): TabView | null => views[tab] ?? null, writeTab: (): void => undefined, tabOf: (): null => null };
}

function recordsOf(recaps: Readonly<Record<string, TabRecap>>): RecapRecords {
    return { readRecap: (tab): TabRecap | null => recaps[tab] ?? null } as RecapRecords;
}

test('a tab document matches the v2 schema and keeps the rules section', () => {
    const document = guiTabOf(recapOf('tb1'), viewOf('tb1'), instant(9));
    assert.deepEqual(v2Problems(wire(document)), []);
    assert.equal(document.name, 'Login page');
    assert.equal(document.status, 'blocked');
    assert.deepEqual(document.tasks.map((task) => task.sections.goal), ['Ship the login page']);
    assert.deepEqual(document.tasks.map((task) => Object.keys(task.sections)), [['goal', 'now', 'needs', 'done', 'decisions', 'next', 'links', 'rules']]);
});

test('a tab without a view still has a document', () => {
    const document = guiTabOf(blankRecap('tb2'), null, instant(9));
    assert.deepEqual(v2Problems(wire(document)), []);
    assert.equal(document.name, 'tb2');
    assert.equal(document.status, 'idle');
    assert.equal(document.writing, 'resting');
});

test('the worst status wins: blocked, working, done, idle', () => {
    assert.equal(worstStatus([laneOf('idle'), laneOf('done'), laneOf('working')]), 'working');
    assert.equal(worstStatus([laneOf('working'), laneOf('blocked')]), 'blocked');
    assert.equal(worstStatus([laneOf('unknown')]), 'idle');
});

test('a document over the limit is fitted, and the document says what it left out', () => {
    const document = guiTabOf(recapOf('tb3'), null, instant(9));
    const padded: GuiTab = { ...document, error: must(parseText('x'.repeat(GUI_TAB_LIMIT))) };
    const encoded = encodeGuiTab(padded);
    if (encoded.kind === 'err') { throw new Error(`refused at ${encoded.error.bytes} bytes`); }
    assert.ok(Buffer.byteLength(encoded.value) <= GUI_TAB_LIMIT);
    const parsed = JSON.parse(encoded.value);
    assert.equal(parsed.error, TOO_LARGE_ERROR);
    assert.deepEqual(parsed.cuts.map((cut: { part: string }) => cut.part), ['markdown', 'facts']);
    assert.deepEqual(v2Problems(parsed), []);
});

test('a tab id with a slash or a colon makes one safe file name', () => {
    assert.equal(guiFileName(tabId('w1:2/3')), 'w1%3A2%2F3.json');
});

test('publishing writes the tab file and an index, newest first, and survives a restart', () => {
    const dir = must(parseDirectory(mkdtempSync(join(tmpdir(), 'gui-pub-'))));
    const logged: string[] = [];
    const records = recordsOf({ a: recapOf('a'), b: recapOf('b') });
    const views = tabViewsOf({ a: viewOf('a') });
    const publisher = new GuiPublisher({ dir, records, views, now: (): Instant => instant(100), log: (line): void => { logged.push(line); } });
    publisher.publish(tabId('a'));
    publisher.publish(tabId('b'));
    publisher.publish(tabId('missing'));
    const index: { tabs: { tab: string; status: string }[] } = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
    assert.deepEqual(index.tabs.map((row) => row.tab), ['b', 'a']);
    assert.equal(index.tabs[1]?.status, 'blocked');
    assert.deepEqual(v2Problems(JSON.parse(readFileSync(join(dir, 'a.json'), 'utf8'))), []);
    const again = new GuiPublisher({ dir, records, views, now: (): Instant => instant(300), log: (): void => undefined });
    again.publish(tabId('a'));
    const after: { tabs: { tab: string }[] } = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
    assert.deepEqual(after.tabs.map((row) => row.tab), ['a', 'b']);
    assert.deepEqual(logged, []);
});

test('a tab with agents but no recap yet is published with its lanes', () => {
    const dir = must(parseDirectory(mkdtempSync(join(tmpdir(), 'gui-pub-'))));
    const publisher = new GuiPublisher({ dir, records: recordsOf({}), views: tabViewsOf({ a: viewOf('a') }), now: (): Instant => instant(100), log: (): void => undefined });
    publisher.publish(tabId('a'));
    const written: { lanes: { pane: string; status: string }[]; tasks: unknown[] } = JSON.parse(readFileSync(join(dir, 'a.json'), 'utf8'));
    assert.deepEqual(written.lanes.map((lane) => [lane.pane, lane.status]), [['p1', 'working'], ['p2', 'blocked']]);
    assert.deepEqual(written.tasks, []);
    assert.deepEqual(v2Problems(written), []);
});

test('writing a tab view through the publishing views publishes that tab', () => {
    const seen: string[] = [];
    const stored: TabView[] = [];
    const inner = { ...tabViewsOf({}), writeTab: (view: TabView): void => { stored.push(view); }, liveLanes: (): never => { throw new Error('not used'); } };
    new PublishingViews(inner, (tab) => seen.push(tab)).writeTab(viewOf('w1:2'));
    assert.deepEqual([stored.length, seen], [1, ['w1:2']]);
});

test('a read that throws is logged and never escapes the publish path', () => {
    const dir = must(parseDirectory(mkdtempSync(join(tmpdir(), 'gui-pub-'))));
    const logged: string[] = [];
    const records = { readRecap: (): never => { throw new Error('database is locked'); } } as unknown as RecapRecords;
    const publisher = new GuiPublisher({ dir, records, views: tabViewsOf({}), now: (): Instant => instant(100), log: (line): void => { logged.push(line); } });
    assert.doesNotThrow(() => { publisher.publish(tabId('a')); });
    assert.match(logged.join('\n'), /tab a not published: database is locked/);
});
