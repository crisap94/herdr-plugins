import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Briefing } from '#src/recap/application/compaction-briefing.ts';
import type { CompactionDeps } from '#src/recap/application/compaction-deps.ts';
import { guidanceOf } from '#src/recap/application/compaction-message.ts';
import { paneId, tabId } from '#src/recap/domain/ids.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { must } from '#src/protocol/result.ts';
import { compactPreviewOf } from '#src/recap/application/compact-preview.ts';
import { blankRecap, type TabRecap } from '#src/ports/recap-records.ts';
import { NO_SECTIONS, type RecapSections } from '#src/recap/domain/shape.ts';
import type { LaneWeb, TabLane, TabView } from '#src/ports/tab-views.ts';
import { requestNoteOf } from '#src/recap/application/compact-start.ts';
import { cursor } from '#test/db/support.ts';
import { apiProblems } from '#test/gui-schema-support.ts';
import { add, api, OTHER_PANE, PANE, seedOther, seedRun, startWorld, TAB, type World } from '#test/desktop-engine-world.ts';

const compactPath = (query: string): string => `/v1/tabs/${encodeURIComponent(TAB)}/compact-message?${query}`;

const handoffPath = (query: string): string => `/v1/tabs/${encodeURIComponent(TAB)}/handoff-message?${query}`;

const seededWorld = async (): Promise<World> => {
    const world = await startWorld();
    seedRun(world, Date.now() - 60_000, [add('goal', 'Ship the login page'), add('needs', 'Which database do we use?'), add('decisions', 'Use postgres'), add('rules', 'Never touch main'), add('now', 'Wiring the form')]);
    return world;
};

const briefingOver = (world: World): Briefing => new Briefing({ records: world.store.records, webs: { of: (): null => null }, brief: { enabled: (): boolean => { throw new Error('a model was asked'); }, write: (): never => { throw new Error('a model was asked'); } } } as unknown as CompactionDeps);

function tableCounts(world: World): Record<string, number> {
    const names = world.store.db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
    return Object.fromEntries(names.map(({ name }) => [name, (world.store.db.prepare(`SELECT count(*) AS n FROM "${name}"`).get() as { n: number }).n]));
}

test('the compact message is the engine guidance for the lane, labelled as no model, and matches the schema', async () => {
    const world = await seededWorld();
    try {
        const reply = await api(world, 'GET', compactPath(`pane=${PANE}&note=${encodeURIComponent('keep the schema')}`));
        const material = briefingOver(world).materialOf(tabId(TAB), paneId(PANE), must(parseText('keep the schema')));
        assert.equal(reply.status, 200);
        assert.deepEqual(reply.body, { kind: 'guidance', model: false, text: guidanceOf(material), limit: 3000, noteLimit: 280 });
        assert.deepEqual(apiProblems(reply.body, 'compactMessage'), []);
        const text = (reply.body as { text: string }).text;
        assert.match(text, /Above all, keep: keep the schema/u);
        assert.match(text, /Which database do we use\?/u);
        const bare = await api(world, 'GET', compactPath(`pane=${PANE}`));
        assert.deepEqual((bare.body as { text: string }).text, guidanceOf(briefingOver(world).materialOf(tabId(TAB), paneId(PANE), null)));
    } finally { world.close(); }
});

const filesOf = (world: World): string => JSON.stringify(readdirSync(world.root, { recursive: true }).toSorted((a, b) => String(a).localeCompare(String(b))).map((name) => [name, statSync(join(world.root, String(name))).mtimeMs]));

test('the compact message reads and writes nothing: no table changes, no model is asked', async () => {
    const world = await seededWorld();
    try {
        const before = [tableCounts(world), JSON.stringify(world.store.ledger.allOf({ tab: TAB, key: 't1' })), filesOf(world)];
        for (let n = 0; n < 3; n += 1) { assert.equal((await api(world, 'GET', compactPath(`pane=${PANE}&note=x`))).status, 200); }
        assert.equal((await api(world, 'GET', handoffPath(`from=${PANE}`))).status, 200);
        assert.deepEqual([tableCounts(world), JSON.stringify(world.store.ledger.allOf({ tab: TAB, key: 't1' })), filesOf(world)], before);
    } finally { world.close(); }
});

test('a note of 280 characters is taken and 281 is refused; an unknown pane, an unknown tab and a missing pane are refused', async () => {
    const world = await seededWorld();
    try {
        assert.equal((await api(world, 'GET', compactPath(`pane=${PANE}&note=${'a'.repeat(280)}`))).status, 200);
        const long = await api(world, 'GET', compactPath(`pane=${PANE}&note=${'a'.repeat(281)}`));
        assert.deepEqual([long.status, long.body], [400, { error: 'note-too-long' }]);
        const pane = await api(world, 'GET', compactPath('pane=w9:p9'));
        assert.deepEqual([pane.status, pane.body], [404, { error: 'unknown-pane' }]);
        const tab = await api(world, 'GET', `/v1/tabs/nope/compact-message?pane=${PANE}`);
        assert.deepEqual([tab.status, tab.body], [404, { error: 'unknown-tab' }]);
        assert.equal((await api(world, 'GET', compactPath(''))).status, 400);
        assert.equal((await api(world, 'GET', compactPath(`pane=${PANE}`), null)).status, 401);
        assert.equal((await api(world, 'POST', compactPath(`pane=${PANE}`))).status, 405);
        for (const reply of [long, pane, tab]) { assert.deepEqual(apiProblems(reply.body, 'error'), []); }
    } finally { world.close(); }
});

test('the compact message drops the least important lines to fit 3000 characters, as the engine does', () => {
    const sections = { ...NO_SECTIONS, goal: 'g'.repeat(500), decisions: Array.from({ length: 40 }, (_, n) => `Decision ${n}: ${'because '.repeat(30)}`) };
    const records = { readRecap: (): TabRecap => ({ ...blankRecap(TAB), lanes: [cursor(PANE)], tasks: [{ id: 't1', name: '', lanes: [PANE], sections, markdown: '' }] }) };
    const made = compactPreviewOf({ records, views: { readTab: (): null => null } }, tabId(TAB), paneId(PANE), must(parseText('n'.repeat(280))));
    assert.ok(made.kind === 'guidance');
    assert.ok(made.text.length <= 3000);
    assert.equal(made.text, guidanceOf({ sections, web: null, note: 'n'.repeat(280) }));
});

test('the handoff message is what handoff --print prints for the same lane', async () => {
    const world = await seededWorld();
    try {
        const reply = await api(world, 'GET', handoffPath(`from=${PANE}`));
        assert.equal(reply.status, 200);
        assert.deepEqual(apiProblems(reply.body, 'handoffMessage'), []);
        const ran = spawnSync(process.execPath, [join(import.meta.dirname, '..', 'bin', 'tab-recap.ts'), 'handoff', '--from', PANE, '--print'], {
            encoding: 'utf8', env: { PATH: process.env['PATH'] ?? '', HOME: world.root, HERDR_PLUGIN_CONFIG_DIR: join(world.root, 'config'), TAB_RECAP_STATE: world.root, TAB_RECAP_LOCALE: 'en' },
        });
        assert.equal(ran.status, 0, ran.stderr);
        assert.deepEqual(reply.body, { kind: 'handoff', text: ran.stdout.replace(/\n$/u, '') });
    } finally { world.close(); }
});

test('the handoff message refuses what it cannot print: an unknown lane, an unknown tab, the same lane twice', async () => {
    const world = await seededWorld();
    try {
        const lane = await api(world, 'GET', handoffPath('from=w9:p9'));
        assert.deepEqual([lane.status, lane.body], [404, { error: 'unknown-pane' }]);
        const tab = await api(world, 'GET', `/v1/tabs/nope/handoff-message?from=${PANE}`);
        assert.deepEqual([tab.status, tab.body], [404, { error: 'unknown-tab' }]);
        const same = await api(world, 'GET', handoffPath(`from=${PANE}&to=${PANE}`));
        assert.deepEqual([same.status, same.body], [409, { error: 'handoff-refused', detail: 'source-equals-target' }]);
        assert.equal((await api(world, 'GET', handoffPath(''))).status, 400);
        for (const reply of [lane, tab, same]) { assert.deepEqual(apiProblems(reply.body, 'error'), []); }
    } finally { world.close(); }
});

const WEB = { base: 'https://github.com/acme/app', forge: 'github', branch: 'main' } as const;

const sectionsOf = (goal: string, rest: Partial<RecapSections> = {}): RecapSections => ({ ...NO_SECTIONS, goal, ...rest });

interface Shape {
    readonly name: string;
    readonly recap: TabRecap | null;
    readonly view: TabView | null;
    readonly note: string;
}

const lane = (pane: string, web: LaneWeb | null): TabLane => ({ pane, agent: 'claude', status: 'idle', title: 'x', cwd: '/repo', web });

const SHAPES: readonly Shape[] = [
    {
        name: 'two tasks, the lane in the second, a web, a note with newlines and unicode',
        recap: { ...blankRecap(TAB), lanes: [cursor(PANE), cursor('w1:p2')], tasks: [
            { id: 'a', name: 'A', lanes: ['w1:p2'], sections: sectionsOf('Other goal'), markdown: '' },
            { id: 'b', name: 'B', lanes: [PANE], sections: sectionsOf('Ship it', { needs: ['Which db?'], links: ['PR #12', 'src/app.ts:4'], decisions: ['Use postgres: simpler ops'], now: ['Wiring'], next: ['Docs'], rules: ['Never touch main'] }), markdown: '' },
        ] },
        view: { tab: TAB, column: null, at: 1, lanes: [lane(PANE, WEB), lane('w1:p2', null)] },
        note: 'keep\nthe  schema \té\u{1F600}\u0007',
    },
    {
        name: 'a closed lane: in the recap and no longer in the view; a task without sections',
        recap: { ...blankRecap(TAB), lanes: [cursor(PANE)], tasks: [{ id: 'a', name: 'A', lanes: [PANE], sections: null, markdown: '' }] },
        view: { tab: TAB, column: null, at: 1, lanes: [] },
        note: '',
    },
    {
        name: 'no recap record at all: the lane is only in the view',
        recap: null,
        view: { tab: TAB, column: null, at: 1, lanes: [lane(PANE, WEB)] },
        note: '   ',
    },
];

for (const shape of SHAPES) {
    test(`the preview is Briefing.materialOf then guidanceOf, byte for byte: ${shape.name}`, () => {
        const records = { readRecap: (): TabRecap | null => shape.recap };
        const views = { readTab: (): TabView | null => shape.view };
        const webs = { of: (pane: string): LaneWeb | null => shape.view?.lanes.find((each) => each.pane === pane)?.web ?? null };
        const briefing = new Briefing({ records, webs, brief: { enabled: (): boolean => { throw new Error('a model was asked'); }, write: (): never => { throw new Error('a model was asked'); } } } as unknown as CompactionDeps);
        const made = compactPreviewOf({ records, views }, tabId(TAB), paneId(PANE), must(parseText(shape.note)));
        const expected = guidanceOf(briefing.materialOf(tabId(TAB), paneId(PANE), requestNoteOf(shape.note)));
        assert.deepEqual(made, { kind: 'guidance', text: expected });
    });
}

test('over the limit the preview is exactly what compaction sends: nothing is cut, and no character is split in half', () => {
    const records = { readRecap: (): TabRecap => ({ ...blankRecap(TAB), lanes: [cursor(PANE)], tasks: [{ id: 't1', name: '', lanes: [PANE], sections: sectionsOf('\u{1F600}'.repeat(2000)), markdown: '' }] }) };
    const made = compactPreviewOf({ records, views: { readTab: (): null => null } }, tabId(TAB), paneId(PANE), must(parseText('')));
    assert.ok(made.kind === 'guidance');
    assert.equal(made.text, guidanceOf({ sections: sectionsOf('\u{1F600}'.repeat(2000)), web: null, note: null }));
    assert.doesNotMatch(made.text, /\p{Surrogate}/u);
});

test('a note is counted the way compaction counts it: after whitespace collapse, in characters', async () => {
    const world = await seededWorld();
    try {
        const padded = await api(world, 'GET', compactPath(`pane=${PANE}&note=${encodeURIComponent(`a${' '.repeat(400)}\n\tb`)}`));
        assert.equal(padded.status, 200);
        assert.match((padded.body as { text: string }).text, /Above all, keep: a b \(2\)/u);
        assert.equal((await api(world, 'GET', compactPath(`pane=${PANE}&note=${encodeURIComponent('\u{1F600}'.repeat(280))}`))).status, 200);
        assert.equal((await api(world, 'GET', compactPath(`pane=${PANE}&note=${encodeURIComponent('\u{1F600}'.repeat(281))}`))).status, 400);
    } finally { world.close(); }
});

test('what the mod puts in the query arrives as typed: & = % + and unicode survive, and the first of a repeated parameter is used', async () => {
    const world = await seededWorld();
    try {
        const typed = 'a&b=c%20d+e é\u{1F600} #x';
        const sent = new URLSearchParams({ pane: PANE, note: typed }).toString();
        const reply = await api(world, 'GET', compactPath(sent));
        assert.match((reply.body as { text: string }).text, /Above all, keep: a&b=c%20d\+e é\u{1F600} #x \(2\)/u);
        const encoded = await api(world, 'GET', compactPath(`pane=${PANE}&note=${encodeURIComponent(typed)}`));
        assert.deepEqual(encoded.body, reply.body);
        const twice = await api(world, 'GET', compactPath(`pane=${PANE}&pane=w9:p9`));
        assert.equal(twice.status, 200);
    } finally { world.close(); }
});

test('the handoff message ignores which terminal it would go to, refuses an empty one, needs the token and a GET', async () => {
    const world = await seededWorld();
    try {
        const bare = await api(world, 'GET', handoffPath(`from=${PANE}`));
        const elsewhere = await api(world, 'GET', handoffPath(`from=${PANE}&to=w7:p7`));
        assert.deepEqual(elsewhere, bare);
        assert.equal((await api(world, 'GET', handoffPath(`from=${PANE}&to=`))).status, 400);
        assert.equal((await api(world, 'GET', handoffPath(`from=${PANE}`), null)).status, 401);
        assert.equal((await api(world, 'POST', handoffPath(`from=${PANE}`))).status, 405);
    } finally { world.close(); }
});

test('a lane of another tab is not reachable through this tab, for the compact message or the handoff message', async () => {
    const world = await seededWorld();
    try {
        seedOther(world, [add('goal', 'Somebody else')]);
        const compact = await api(world, 'GET', compactPath(`pane=${OTHER_PANE}`));
        const handoff = await api(world, 'GET', handoffPath(`from=${OTHER_PANE}`));
        assert.deepEqual([compact.status, compact.body, handoff.status, handoff.body], [404, { error: 'unknown-pane' }, 404, { error: 'unknown-pane' }]);
    } finally { world.close(); }
});
