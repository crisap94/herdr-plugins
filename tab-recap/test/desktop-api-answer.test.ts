import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { apiProblems, v2Problems } from '#test/gui-schema-support.ts';
import { ExpandedModel } from '#src/recap/application/expanded-view.ts';
import { add, api, OTHER_TAB, seedOther, seedRun, seqOf, startWorld, TAB, TASK, type World } from '#test/desktop-engine-world.ts';

interface Doc {
    readonly tasks: readonly { readonly regions: { readonly needs: readonly string[] }; readonly facts: readonly { readonly id: string; readonly section: string; readonly state: string; readonly closedWhy: string | null }[] }[];
}

interface Index {
    readonly tabs: readonly { readonly tab: string; readonly needs: number }[];
}

const published = (world: World): Index => JSON.parse(readFileSync(join(world.root, 'gui', 'index.json'), 'utf8'));

const documentOf = async (world: World): Promise<Doc> => (await api(world, 'GET', `/v1/tabs/${encodeURIComponent(TAB)}`)).body as Doc;

const answerPath = (id: string): string => `/v1/tabs/${encodeURIComponent(TAB)}/needs/${encodeURIComponent(id)}/answer`;

async function seeded(): Promise<{ world: World; need: string; other: string; now: string }> {
    const world = await startWorld();
    seedRun(world, Date.now() - 60_000, [add('needs', 'Which database do we use?'), add('needs', 'Who approves the release?'), add('now', 'Wiring the form')]);
    const facts = world.store.ledger.allOf(TASK);
    const idOf = (text: string): string => facts.find((fact) => fact.text === text)?.id ?? '';
    return { world, need: idOf('Which database do we use?'), other: idOf('Who approves the release?'), now: idOf('Wiring the form') };
}

async function assertRepublished(world: World, listed: readonly string[], seq: number): Promise<void> {
    const after = await documentOf(world);
    assert.deepEqual(v2Problems(after), []);
    assert.deepEqual(after.tasks[0]?.regions.needs, listed.slice(1));
    assert.equal(published(world).tabs[0]?.needs, 1);
    const events = (await api(world, 'GET', `/v1/events?since=${seq}&wait=0`)).body as { events: { topic: string; tab: string | null }[] };
    assert.deepEqual(events.events.map((event) => [event.topic, event.tab]), [['tab', TAB], ['index', null]]);
}

test('answering a need closes it in the ledger, republishes the tab and the index, and tells the bus; the id is the one in the published tab document', async () => {
    const { world, need, other } = await seeded();
    try {
        const before = await documentOf(world);
        assert.deepEqual(v2Problems(before), []);
        assert.equal(published(world).tabs[0]?.needs, 2);
        const listed = before.tasks[0]?.regions.needs ?? [];
        assert.deepEqual([...listed].toSorted((a, b) => a.localeCompare(b)), [need, other].toSorted((a, b) => a.localeCompare(b)));
        assert.ok(before.tasks[0]?.facts.some((fact) => fact.id === need && fact.section === 'needs' && fact.state === 'open'));
        const seq = await seqOf(world);
        const reply = await api(world, 'POST', answerPath(listed[0] ?? ''));
        assert.equal(reply.status, 200);
        assert.deepEqual(reply.body, { answered: true, id: listed[0] });
        assert.deepEqual(apiProblems(reply.body, 'answered'), []);
        const closed = world.store.ledger.allOf(TASK).find((fact) => fact.id === listed[0]);
        assert.deepEqual([closed?.state, closed?.closedWhy, typeof closed?.closedAt], ['closed', 'answered', 'number']);
        assert.equal(world.store.ledger.openOf(TASK).filter((fact) => fact.section === 'needs').length, 1);
        await assertRepublished(world, listed, seq);
    } finally { world.close(); }
});

test('a fact that is not a need, one already closed, one that does not exist, and a tab that is not published are refused with nothing written', async () => {
    const { world, need, now } = await seeded();
    try {
        const rows = (): string => JSON.stringify(world.store.ledger.allOf(TASK));
        const before = rows();
        const notNeed = await api(world, 'POST', answerPath(now));
        assert.deepEqual([notNeed.status, notNeed.body], [409, { error: 'not-a-need' }]);
        const missing = await api(world, 'POST', answerPath('fct_00000000000000000000000000'));
        assert.deepEqual([missing.status, missing.body], [404, { error: 'unknown-need' }]);
        const nowhere = await api(world, 'POST', `/v1/tabs/nope/needs/${need}/answer`);
        assert.deepEqual([nowhere.status, nowhere.body], [404, { error: 'unknown-tab' }]);
        assert.equal(rows(), before);
        assert.equal((await api(world, 'POST', answerPath(need))).status, 200);
        const again = await api(world, 'POST', answerPath(need));
        assert.deepEqual([again.status, again.body], [409, { error: 'not-open' }]);
        for (const reply of [notNeed, missing, nowhere, again]) { assert.deepEqual(apiProblems(reply.body, 'error'), []); }
    } finally { world.close(); }
});

test('answering needs the bearer token and a POST', async () => {
    const { world, need } = await seeded();
    try {
        assert.equal((await api(world, 'POST', answerPath(need), null)).status, 401);
        assert.equal((await api(world, 'POST', answerPath(need), 'wrong')).status, 401);
        assert.equal((await api(world, 'GET', answerPath(need))).status, 405);
        assert.equal(world.store.ledger.openOf(TASK).filter((fact) => fact.section === 'needs').length, 2);
    } finally { world.close(); }
});

test('two answers at once close the need once: the second is refused as not open', async () => {
    const { world, need } = await seeded();
    try {
        const both = await Promise.all([api(world, 'POST', answerPath(need)), api(world, 'POST', answerPath(need))]);
        assert.deepEqual(both.map((reply) => reply.status).toSorted((a, b) => a - b), [200, 409]);
        assert.deepEqual(both.find((reply) => reply.status === 409)?.body, { error: 'not-open' });
        assert.equal(world.store.ledger.allOf(TASK).filter((fact) => fact.closedWhy === 'answered').length, 1);
    } finally { world.close(); }
});

const dump = (world: World, table: string): string => JSON.stringify(world.store.db.prepare(`SELECT * FROM ${table}`).all().map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Uint8Array ? Buffer.from(value).toString('hex') : value]))));

test('the close is pure: the only row that changes is the fact itself, and no story is touched', async () => {
    const { world, need } = await seeded();
    try {
        world.store.db.prepare('UPDATE task SET story_text = ?, story_at = ? WHERE tab_id = ?').run('the story so far', 1_000, TAB);
        const others = (world.store.db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'fact'").all() as { name: string }[]).map((row) => row.name);
        const before = others.map((table) => dump(world, table));
        const untouched = world.store.ledger.allOf(TASK).filter((fact) => fact.id !== need);
        assert.equal((await api(world, 'POST', answerPath(need))).status, 200);
        assert.deepEqual(others.map((table) => dump(world, table)), before);
        assert.deepEqual(world.store.ledger.allOf(TASK).filter((fact) => fact.id !== need), untouched);
        assert.deepEqual(world.store.stories.read(TAB, 't1'), { text: 'the story so far', at: 1_000 });
    } finally { world.close(); }
});

test('a need of another tab cannot be closed through this tab, even when that tab is published', async () => {
    const { world } = await seeded();
    try {
        seedOther(world, [add('needs', 'Foreign question?')]);
        const foreign = world.store.ledger.allOf({ tab: OTHER_TAB, key: 't9' })[0]?.id ?? '';
        const reply = await api(world, 'POST', answerPath(foreign));
        assert.deepEqual([reply.status, reply.body], [404, { error: 'unknown-need' }]);
        assert.equal(world.store.ledger.openOf({ tab: OTHER_TAB, key: 't9' }).length, 1);
    } finally { world.close(); }
});

test('the terminal screen and the expanded view read the same ledger: the need is gone from the recap and shown closed as answered', async () => {
    const { world, need } = await seeded();
    try {
        assert.equal((await api(world, 'POST', answerPath(need))).status, 200);
        const recap = world.store.records.readRecap(TAB);
        assert.deepEqual(recap?.tasks[0]?.sections?.needs, ['Who approves the release?']);
        const expanded = new ExpandedModel({ records: world.store.records, ledger: world.store.ledger, stories: world.store.stories, session: world.store.session, boundaries: world.store.boundaries, requests: { requestCurate: (): void => undefined }, edits: (): [] => [] });
        const task = expanded.read(TAB, world.store.views.readTab(TAB), Date.now()).tasks[0];
        assert.deepEqual(task?.facts.filter((fact) => fact.id === need).map((fact) => [fact.state, fact.closedWhy]), [['closed', 'answered']]);
    } finally { world.close(); }
});

test('a curator holding an older picture cannot undo the hand close: its update and close of that need are refused and the need stays closed', async () => {
    const { world, need } = await seeded();
    try {
        assert.equal((await api(world, 'POST', answerPath(need))).status, 200);
        const closed = world.store.ledger.allOf(TASK).find((fact) => fact.id === need);
        const id = closed?.id;
        assert.ok(id !== undefined);
        const run = { task: TASK, at: Date.now(), language: 'en' };
        const applied = world.store.stories.keep(run, { story: null, merges: [{ op: 'close', id, why: 'answered' }], reconciled: [{ op: 'update', id, text: 'Which database do we use now?', why: null, anchor: null }] });
        assert.deepEqual(applied.refused.map((turned) => turned.reason), ['closed', 'closed']);
        assert.deepEqual(world.store.ledger.allOf(TASK).find((fact) => fact.id === need), closed);
    } finally { world.close(); }
});
