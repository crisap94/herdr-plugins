import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExpandedModel } from '#src/recap/application/expanded-view.ts';
import type { ExpandedDeps } from '#src/recap/application/expanded-view.ts';
import { guiTabOf } from '#src/recap/application/gui-tab-build.ts';
import { BLANK_READS } from '#src/recap/application/gui-tab-reads.ts';
import { must } from '#src/protocol/result.ts';
import { fitGuiTab } from '#src/recap/domain/gui-fit.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { GUI_TAB_LIMIT, encodeGuiTab, parseGuiIndex } from '#src/recap/domain/gui-tab.ts';
import { parseGuiVersion, type GuiTab, type GuiTask } from '#src/recap/domain/gui-tab-types.ts';
import type { GuiFactRow } from '#src/recap/domain/gui-tab-parts.ts';
import { parseNonEmptyText, parseText } from '#src/recap/domain/text.ts';
import { instant } from '#src/recap/domain/time.ts';
import { blankRecap } from '#src/ports/recap-records.ts';
import type { TabView } from '#src/ports/tab-views.ts';
import { cursor, memoryStore, must as present, seed } from '#test/db/support.ts';
import { fact } from '#test/fakes/fact-at.ts';
import { MemoryLedger } from '#test/fakes/memory-ledger.ts';
import { NOW } from '#test/fakes/expanded-fixture.ts';
import { v2Problems } from '#test/gui-schema-support.ts';

const MIN = 60_000;

const crowdedRow = (at: number): GuiFactRow => ({ kind: 'fact', fact: must(parseNonEmptyText(`f${at}`)), at: instant(at), clock: must(parseText('00:00 '.repeat(20))), day: null, closed: null });

const view: TabView = {
    tab: 'w1:t1', column: null, at: NOW, lanes: [{ pane: 'w1:p1', agent: 'claude', status: 'idle', title: 'orchestrator', cwd: null, context: { tokens: 100_000, window: 200_000, source: 'agent' }, web: { base: 'https://git.example/acme/shop', forge: 'gitlab', branch: 'main' } }],
};

function fixture(): { document: GuiTab; expanded: ReturnType<ExpandedModel['read']> } {
    const store = memoryStore();
    seed(store, { ...blankRecap('w1:t1'), at: NOW - 3 * 60 * MIN, lanes: [cursor('w1:p1')], tasks: [{ id: 't1', name: '', lanes: ['w1:p1'], sections: null, markdown: '## Goal\n- x' }] });
    const ledger = new MemoryLedger()
        .seed(fact('d1', 'decisions', 'Use sqlite', NOW - 30 * MIN))
        .seed(fact('n1', 'needs', 'Need the API key', NOW - 25 * MIN))
        .seed(fact('w1', 'now', 'Running the tests', NOW - 20 * MIN))
        .seed(fact('x1', 'done', 'Shipped the schema', NOW - 10 * MIN));
    const deps: ExpandedDeps = { records: store.records, ledger, stories: store.stories, session: store.session, boundaries: store.boundaries, requests: { requestCurate: (): void => undefined }, edits: () => [] };
    const expanded = new ExpandedModel(deps).read('w1:t1', view, NOW);
    const recap = present(store.records.readRecap('w1:t1'));
    const document = guiTabOf(recap, view, instant(NOW), { ...BLANK_READS, expanded, zone: must(parseText('UTC')) });
    return { document, expanded };
}

test('a v2 document for one fixture validates against the v2 schema', () => {
    const { document } = fixture();
    assert.equal(document.version, 2);
    assert.deepEqual(v2Problems(JSON.parse(JSON.stringify(document))), []);
});

test('the document carries the same facts, decisions, timeline and needs as ExpandedModel.read for the same store', () => {
    const { document, expanded } = fixture();
    const task = present(document.tasks[0]);
    const read = present(expanded.tasks[0]);
    const textsIn = (section: string): string[] => read.facts.filter((one) => one.section === section).map((one) => one.text);
    assert.deepEqual(task.facts.map((one) => one.text), read.facts.map((one) => one.text));
    assert.deepEqual(task.regions.decisions.length, textsIn('decisions').length);
    assert.deepEqual(task.regions.needs.length, textsIn('needs').length);
    const timelineIds = read.facts.filter((one) => one.section === 'done' || one.state === 'closed').map((one) => one.id);
    assert.deepEqual(task.timeline.flatMap((row) => (row.kind === 'fact' ? [row.fact] : [])).toSorted(), timelineIds.toSorted());
    assert.deepEqual(timelineIds, ['x1']);
    assert.equal(task.story, null);
    assert.equal(read.story, null);
});

test('the 1 MiB cap cuts the timeline first and records the cut', () => {
    const { document } = fixture();
    const base = present(document.tasks[0]);
    const crowded: GuiTask = { ...base, timeline: Array.from({ length: 6000 }, (_, at) => crowdedRow(at)) };
    const encoded = encodeGuiTab({ ...document, tasks: [crowded] });
    if (encoded.kind === 'err') { throw new Error(`refused at ${encoded.error.bytes} bytes`); }
    assert.ok(Buffer.byteLength(encoded.value) <= GUI_TAB_LIMIT);
    const parsed = JSON.parse(encoded.value);
    assert.deepEqual(parsed.cuts, [{ part: 'timeline', task: 't1', kept: 200, total: 6000 }]);
    assert.equal(parsed.tasks[0].timeline.length, 200);
    assert.equal(parsed.tasks[0].markdown, base.markdown);
    assert.deepEqual(v2Problems(parsed), []);
});

test('parseGuiIndex still accepts version 1 rows, and the version gate takes 1 and 2 only', () => {
    const index = parseGuiIndex({ tabs: [{ tab: 'w1:t1', name: 'Login', status: 'idle', at: 5 }] });
    assert.deepEqual(index.kind === 'ok' ? index.value.map((row) => row.tab) : null, ['w1:t1']);
    assert.equal(parseGuiVersion({ version: 1 }).kind, 'ok');
    assert.equal(parseGuiVersion({ version: 2 }).kind, 'ok');
    assert.equal(parseGuiVersion({ version: 3 }).kind, 'err');
    assert.equal(parseGuiVersion({}).kind, 'err');
});

const sizeIn = (tab: GuiTab): number => Buffer.byteLength(JSON.stringify(tab));

test('a second timeline cut keeps the original total, so the mod can count what was left out', () => {
    const { document } = fixture();
    const base = present(document.tasks[0]);
    const crowded: GuiTab = { ...document, tasks: [{ ...base, timeline: Array.from({ length: 6000 }, (_, at) => crowdedRow(at)) }] };
    const limit = sizeIn({ ...crowded, tasks: [{ ...base, timeline: Array.from({ length: 100 }, (_, at) => crowdedRow(at)) }] });
    const fitted = fitGuiTab(crowded, must(parseCount(limit)));
    assert.deepEqual(fitted.cuts.filter((each) => each.part === 'timeline'), [{ part: 'timeline', task: 't1', kept: 40, total: 6000 }]);
});

test('the last resort also clears warnings, recaps and lane notes, so it fits when they are what is big', () => {
    const { document } = fixture();
    const big = must(parseText('w'.repeat(4000)));
    const heavy: GuiTab = { ...document, warnings: Array.from({ length: 400 }, () => big), claudeRecaps: Array.from({ length: 400 }, () => big) };
    const fitted = fitGuiTab(heavy, must(parseCount(200_000)));
    assert.ok(sizeIn(fitted) <= 200_000);
    assert.deepEqual([fitted.warnings, fitted.claudeRecaps], [[], []]);
    assert.deepEqual(v2Problems(JSON.parse(JSON.stringify(fitted))), []);
});

test('a cached expanded read is matched to its task by name, never by position', () => {
    const { document, expanded } = fixture();
    const kept = present(expanded.tasks[0]);
    const stale = { ...expanded, tasks: [{ name: 'A', facts: [], story: null, curating: false }, { ...kept, name: 'B' }] };
    const recap = { ...blankRecap('w1:t1'), at: NOW, tasks: [{ id: 't2', name: 'B', lanes: ['w1:p1'], sections: null, markdown: '' }] };
    const built = guiTabOf(recap, view, instant(NOW), { ...BLANK_READS, expanded: stale, zone: must(parseText('UTC')) });
    assert.deepEqual(present(built.tasks[0]).facts.map((one) => one.text), present(document.tasks[0]).facts.map((one) => one.text));
});
