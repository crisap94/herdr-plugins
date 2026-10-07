import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Store } from '#src/adapters/db/database.ts';
import { memoryStore, seed } from '#test/db/support.ts';
import { instructions, message } from '#src/adapters/recap-prompt.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { en } from '#src/i18n/en.ts';
import { es } from '#src/i18n/es.ts';
import { touchedFiles } from '#src/recap/application/lane-hints.ts';
import { RecapJob } from '#src/recap/application/recap-job.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import { keptGrouping } from '#src/recap/domain/grouping.ts';
import type { PlacedLane, TaskShape } from '#src/recap/domain/grouping.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';
import { instant } from '#src/recap/domain/time.ts';
import { present, presentBar } from '#src/recap/render/present.ts';
import { groupsOf } from '#src/recap/render/groups.ts';
import { blankRecap } from '#src/ports/recap-records.ts';
import type { TabRecap } from '#src/ports/recap-records.ts';
import type { TabLane, TabView } from '#src/ports/tab-views.ts';
import type { LaneRepo } from '#src/ports/lane-repo.ts';
import type { RecapRequest, Summarizer, Written } from '#src/ports/summarizer.ts';
import type { ChunkResult, Located, PromptResult, Transcripts } from '#src/ports/transcripts.ts';
import { agentOf, firstTask, oneTask, requestOf } from '#test/support.ts';

const sections = (goal: string, rest: Partial<typeof NO_SECTIONS> = {}): typeof NO_SECTIONS => ({ ...NO_SECTIONS, goal, ...rest });
const taskOf = (id: string, name: string, lanes: readonly string[], goal = id): RecapTask => ({ id, name, lanes, sections: sections(goal), markdown: `## Goal\n${goal}` });
const shape = (id: string, name: string, lanes: readonly string[]): TaskShape => ({ id, name, lanes });

// ── the grouping ─────────────────────────────────────────────────────────────────────────────────

const lanesIn = (place: string | null, ...panes: readonly string[]): PlacedLane[] => panes.map((pane) => ({ pane, place }));
const PAY = '/work/pay';
const DOCS = '/work/docs';

test('grouping: with none yet the lanes that work in one place are one unnamed task; no lanes, no task', () => {
    assert.deepEqual(keptGrouping([], [...lanesIn(PAY, 'w1:p1', 'w1:p2')]), [shape('t1', '', ['w1:p1', 'w1:p2'])]);
    assert.deepEqual(keptGrouping([], []), []);
});

test('grouping: lanes in different places are different tasks, named by their folder; a lane with no known place joins the first task', () => {
    const lanes = [...lanesIn(PAY, 'w1:p1'), ...lanesIn(DOCS, 'w1:p2'), ...lanesIn(PAY, 'w1:p3'), ...lanesIn(null, 'w1:p4')];
    assert.deepEqual(keptGrouping([], lanes), [shape('t1', 'pay', ['w1:p1', 'w1:p3', 'w1:p4']), shape('t2', 'docs', ['w1:p2'])]);
});

test('grouping: the previous grouping is kept — same ids, same names; a closed lane leaves, a task left with no lane is gone', () => {
    const before = [shape('t1', 'Payments', ['w1:p1']), shape('t2', 'Docs', ['w1:p2', 'w1:p3'])];
    const now = [...lanesIn(PAY, 'w1:p1'), ...lanesIn(DOCS, 'w1:p2', 'w1:p3')];
    assert.deepEqual(keptGrouping(before, now), before);
    assert.deepEqual(keptGrouping(before, [...lanesIn(PAY, 'w1:p1'), ...lanesIn(DOCS, 'w1:p3')]), [shape('t1', 'Payments', ['w1:p1']), shape('t2', 'Docs', ['w1:p3'])]);
    assert.deepEqual(keptGrouping(before, lanesIn(DOCS, 'w1:p3')), [shape('t2', '', ['w1:p3'])], 'one task left: no task name');
});

test('grouping: kept even when the lanes now work elsewhere; a new lane joins the task of the lanes in its place, else it is a task of its own', () => {
    const before = [shape('t1', 'Payments', ['w1:p1']), shape('t2', 'Docs', ['w1:p2'])];
    const moved = [...lanesIn(DOCS, 'w1:p1'), ...lanesIn(PAY, 'w1:p2')];
    assert.deepEqual(keptGrouping(before, moved), before, 'sticky: no evidence is asked for, none can move a lane');
    const joined = keptGrouping(before, [...moved, ...lanesIn(PAY, 'w1:p9')]);
    assert.deepEqual(joined.map((task) => task.lanes), [['w1:p1'], ['w1:p2', 'w1:p9']]);
    const apart = keptGrouping(before, [...moved, ...lanesIn('/work/infra', 'w1:p9')]);
    assert.deepEqual(apart.map((task) => [task.id, task.name]), [['t1', 'Payments'], ['t2', 'Docs'], ['t3', 'infra']]);
    assert.deepEqual(keptGrouping(before, [...moved, ...lanesIn(null, 'w1:p9')]).map((task) => task.lanes.length), [2, 1]);
});

test('grouping: when every lane of a tab\'s only task is gone, the next lanes continue it; of several tasks, they are a new one', () => {
    assert.deepEqual(keptGrouping([shape('t1', '', ['w1:p1'])], lanesIn(PAY, 'w1:p9')), [shape('t1', '', ['w1:p9'])]);
    assert.deepEqual(keptGrouping([shape('t1', 'A', ['w1:p1']), shape('t2', 'B', ['w1:p2'])], lanesIn(PAY, 'w1:p9')), [shape('t3', '', ['w1:p9'])]);
});

test('grouping: a key that has ever held a ledger is not given to another task, even when its task is long gone', () => {
    const before = [shape('t1', 'Payments', ['w1:p1'])];
    assert.deepEqual(keptGrouping(before, [...lanesIn(PAY, 'w1:p1'), ...lanesIn(DOCS, 'w1:p2')], ['t1', 't2', 't3']).map((task) => task.id), ['t1', 't4']);
});

test('grouping: a tab that had one unnamed task and gets a lane elsewhere names both tasks', () => {
    assert.deepEqual(keptGrouping([shape('t1', '', ['w1:p1'])], [...lanesIn(PAY, 'w1:p1'), ...lanesIn(DOCS, 'w1:p2')]), [shape('t1', 'pay', ['w1:p1']), shape('t2', 'docs', ['w1:p2'])]);
});

// ── the prompt and the job ───────────────────────────────────────────────────────────────────────

test('the document lists the current tasks only when the tab has several lanes, and carries the hints and one ledger per task', () => {
    const one = requestOf({ entries: [{ role: 'user', text: 'x' }] });
    assert.ok(!message(one).includes('<current_tasks>') && !instructions(one).includes('<ledger task='), 'one agent: no grouping');
    const many = requestOf({
        agents: [agentOf('a1', { cwd: '/r/pay', repo: '/r/pay', branch: 'feat/v2', files: ['src/client.ts'] }), agentOf('a2', { kind: 'codex', cwd: '/tmp' })],
        tasks: [{ id: 't1', name: 'Payments', lanes: ['w1:p1'] }],
        ledgers: [{ task: 't1', facts: [] }],
    });
    const text = message(many);
    assert.ok(text.includes('<agent id="a1" kind="claude" label="" pane="w1:p1" repo="pay" branch="feat/v2">'), 'the repository by name; the folder only when it is not the repository');
    assert.ok(text.includes('<file>src/client.ts</file>'));
    assert.ok(text.includes('<agent id="a2" kind="codex" label="" pane="w1:p2" cwd="/tmp"/>'));
    assert.ok(text.includes('<task id="t1" name="Payments" agents="a1"/>'));
    assert.ok(text.includes('<ledger task="t1"/>'));
    assert.ok(!message({ ...many, input: { ...many.input, tasks: [] } }).includes('<current_tasks>'), 'no grouping yet: none shown');
});

const tool = (kind: 'edit' | 'read' | 'shell', text: string): Entry => ({ role: 'tool', kind, text });

test('files touched are the distinct paths of the edit calls, the most recent last, at most five', () => {
    assert.deepEqual(touchedFiles([tool('edit', 'a.ts'), tool('read', 'r.ts'), tool('edit', 'b.ts'), tool('edit', 'a.ts'), { role: 'agent', text: 'no.ts' }, tool('shell', 'npm test')]), ['b.ts', 'a.ts']);
    assert.equal(touchedFiles(Array.from({ length: 9 }, (_, i) => tool('edit', `f${i}.ts`))).length, 5);
});

const transcripts: Transcripts = {
    agent: 'claude',
    locate: (lane): Promise<Located> => Promise.resolve({ kind: 'located', source: `/t/${lane.pane}` }),
    latestPrompt: (): Promise<PromptResult> => Promise.resolve({ kind: 'prompt', text: null }),
    read: (source: string): Promise<ChunkResult> => Promise.resolve({
        kind: 'chunk', entries: [{ role: 'tool', kind: 'edit', text: `${source.slice(3)}.ts` }, { role: 'agent', text: `work in ${source.slice(3)}` }],
        title: null, lastPrompt: null, claudeRecap: null, notes: [], position: { cursor: 5, tail: null }, grew: true,
    }),
};

const repos: LaneRepo = { repoOf: (cwd) => Promise.resolve(cwd === '/work/pay' ? { kind: 'repo', root: '/work/pay', branch: 'feat/v2', web: null } : { kind: 'no-repo' }) };

async function run(answers: readonly string[], lanes: readonly string[], store = memoryStore()): Promise<{ store: Store; requests: RecapRequest[] }> {
    const requests: RecapRequest[] = [];
    const summarizer: Summarizer = { backend: 'fake', write: (request): Promise<Written> => { requests.push(request); return Promise.resolve({ kind: 'written', text: answers[Math.min(requests.length - 1, answers.length - 1)] ?? '', costUsd: 0 }); } };
    const job = new RecapJob({ transcripts: [transcripts], records: store.records, ledger: store.ledger, repos, clock: { now: (): ReturnType<typeof instant> => instant(1) }, summarizer: (): Summarizer => summarizer, language: (): string => 'en', log: (): void => undefined });
    job.request(tabId('w1:t1'), lanes.map((pane) => laneFrom({ paneId: pane, tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's', cwd: pane === 'w1:p1' ? '/work/pay' : '/work/docs' })), 'requested');
    await new Promise((resolve) => { setTimeout(resolve, 40); });
    return { store, requests };
}

const op = (section: string, text: string, task?: string): Record<string, unknown> => ({ op: 'add', section, text, ...(task === undefined ? {} : { task }) });

test('a tab with two lanes in two places: the request carries each lane\'s hints; the operations are stored per task, each task\'s facts drawn as its Markdown', async () => {
    const answer = JSON.stringify({ ops: [op('goal', 'pay v2'), op('now', 'wiring'), op('goal', 'docs', 't2')] });
    const { store, requests } = await run([answer], ['w1:p1', 'w1:p2']);
    const [request] = requests;
    assert.ok(request !== undefined);
    assert.deepEqual(request.input.agents.map((hint) => [hint.pane, hint.cwd, hint.repo, hint.branch, hint.files]), [
        ['w1:p1', '/work/pay', '/work/pay', 'feat/v2', ['w1:p1.ts']], ['w1:p2', '/work/docs', null, null, ['w1:p2.ts']],
    ]);
    const recap = store.records.readRecap('w1:t1');
    assert.deepEqual(recap?.tasks.map((task) => [task.id, task.name, task.lanes, task.sections?.goal]), [['t1', 'pay', ['w1:p1'], 'pay v2'], ['t2', 'docs', ['w1:p2'], 'docs']], 'no grouping yet: one task per place, named by its folder');
    assert.match(firstTask(recap).markdown, /^## Goal\npay v2\n\n## Now\n- wiring/);
    assert.deepEqual(request.input.tasks, [{ id: 't1', name: 'pay', lanes: ['w1:p1'] }, { id: 't2', name: 'docs', lanes: ['w1:p2'] }], 'and the grouping is told to the writer');
});

test('a tab with ONE lane is not told about tasks, but is still described: the answer is one unnamed task', async () => {
    const { store, requests } = await run([JSON.stringify({ ops: [op('goal', 'solo')] })], ['w1:p1']);
    assert.deepEqual(requests[0]?.input.agents.map((agent) => [agent.cwd, agent.repo, agent.branch, agent.files]), [['/work/pay', '/work/pay', 'feat/v2', ['w1:p1.ts']]], 'the hints are there for a single agent too');
    assert.deepEqual(requests[0].input.tasks, []);
    assert.deepEqual(store.records.readRecap('w1:t1')?.tasks.map((task) => [task.id, task.name, task.lanes, task.sections?.goal]), [['t1', '', ['w1:p1'], 'solo']]);
});

test('the second run: the grouping is kept and goes back to the writer; an add names its task; an update or close goes to the fact\'s own task', async () => {
    const store = memoryStore();
    const seeded = { ...blankRecap('w1:t1'), at: 1, lanes: [], tasks: [taskOf('t1', 'Payments', ['w1:p1'], 'a'), taskOf('t2', 'Docs', ['w1:p2'], 'b')] };
    seed(store, seeded);
    const { requests } = await run([JSON.stringify({ ops: [op('done', 'wrote the intro', 't2'), { op: 'close', id: 'f1', why: 'done' }] })], ['w1:p1', 'w1:p2'], store);
    assert.deepEqual(requests[0]?.input.tasks, [{ id: 't1', name: 'Payments', lanes: ['w1:p1'] }, { id: 't2', name: 'Docs', lanes: ['w1:p2'] }]);
    assert.deepEqual(requests[0].input.ledgers.map((ledger) => [ledger.task, ledger.facts.map((fact) => fact.id)]), [['t1', ['f1']], ['t2', ['f2']]]);
    const recap = store.records.readRecap('w1:t1');
    assert.deepEqual(recap?.tasks.map((task) => [task.id, task.name, task.lanes, task.sections?.goal, task.sections?.done]), [['t1', 'Payments', ['w1:p1'], '', []], ['t2', 'Docs', ['w1:p2'], 'b', ['wrote the intro']]]);
});

// ── the column ───────────────────────────────────────────────────────────────────────────────────

const lane = (pane: string, agent: string, status = 'idle'): TabLane => ({ pane, agent, status, title: null, cwd: null });
const tab = (lanes: readonly TabLane[]): TabView => ({ tab: 'w1:t1', column: null, at: 0, lanes });
const strip = (lines: readonly string[]): string => lines.join('\n').replace(new RegExp(`${String.fromCodePoint(0x1b)}\\[[0-9;]*m`, 'g'), '');
const LANES = [lane('w1:p1', 'claude', 'blocked'), lane('w1:p2', 'codex', 'working'), lane('w1:p3', 'opencode')];

test('groups: one task (or none) is ONE group of every lane; several tasks group their lanes in tab order; a lane no task holds is loose', () => {
    assert.equal(groupsOf(LANES, []).length, 1);
    assert.equal(groupsOf(LANES, [taskOf('t1', '', ['w1:p1'])]).length, 1);
    const groups = groupsOf(LANES, [taskOf('t1', 'A', ['w1:p2', 'w1:p1']), taskOf('t2', 'B', ['w1:p9'])]);
    assert.deepEqual(groups.map((group) => [group.task?.id ?? null, group.lanes.map((l) => l.pane)]), [['t1', ['w1:p1', 'w1:p2']], [null, ['w1:p3']]]);
    assert.equal(groupsOf([LANES[0] ?? lane('x', 'y')], [taskOf('t1', 'A', ['w1:p1']), taskOf('t2', 'B', ['w1:p9'])]).length, 1, 'a task whose lanes all closed is not drawn');
});

test('two tasks: each under its own name, its lanes first, then its own recap; the tab\'s meta once', () => {
    const recap: TabRecap = {
        ...blankRecap('w1:t1'), at: 0, backend: 'claude/haiku',
        tasks: [
            { ...taskOf('t1', 'Payments v2', ['w1:p1', 'w1:p2'], 'ship payments'), sections: sections('ship payments', { needs: ['approve the deploy'] }) },
            { ...taskOf('t2', '', ['w1:p3'], 'write docs'), sections: sections('write docs') },
        ],
    };
    const text = strip(present({ tab: tab(LANES), recap, notes: new Map(), warnings: [], now: 0, messages: en }, 50, () => null));
    const at = (needle: string): number => text.indexOf(needle);
    assert.ok(at('▌ Payments v2') < at('claude w1:p1') && at('claude w1:p1') < at('codex w1:p2') && at('codex w1:p2') < at('ship payments') && at('ship payments') < at('▌ Task 2'), text);
    assert.ok(at('▌ Task 2') < at('opencode w1:p3') && at('opencode w1:p3') < at('write docs'));
    assert.equal(text.split('TAB RECAP').length, 2, 'one meta line for the tab');
    assert.equal(text.split('GOAL').length, 3, 'one recap per task');
    const spanish = strip(present({ tab: tab(LANES), recap, notes: new Map(), warnings: [], now: 0, messages: es }, 50, () => null));
    assert.ok(spanish.includes('▌ Tarea 2') && spanish.includes('OBJETIVO'));
});

test('a lane that arrived after the last recap shows its header, without a recap, after the tasks', () => {
    const recap: TabRecap = { ...blankRecap('w1:t1'), tasks: [taskOf('t1', 'A', ['w1:p1']), taskOf('t2', 'B', ['w1:p2'])] };
    const text = strip(present({ tab: tab(LANES), recap, notes: new Map(), warnings: [], now: 0, messages: en }, 50, () => null));
    assert.ok(text.indexOf('opencode w1:p3') > text.indexOf('▌ B'));
    assert.equal(text.split('GOAL').length, 3);
});

const view = (tasks: readonly RecapTask[]): Parameters<typeof presentBar>[0] =>
    ({ tab: tab(LANES), recap: { ...blankRecap('w1:t1'), tasks }, notes: new Map(), warnings: [], now: 0, messages: en });

test('the bar takes the most urgent "needs you" across tasks — else the first "now"', () => {
    const quiet = { ...taskOf('t1', 'A', ['w1:p1']), sections: sections('a', { now: ['running CI'] }) };
    const blocked = { ...taskOf('t2', 'B', ['w1:p2']), sections: sections('b', { needs: ['approve the deploy'], now: ['waiting'] }) };
    assert.match(strip(presentBar(view([quiet, blocked]), 60)), /needs you: approve the deploy/);
    assert.match(strip(presentBar(view([quiet, { ...blocked, sections: sections('b', { now: ['later'] }) }]), 60)), /running CI/);
    assert.match(strip(presentBar({ ...view([]), recap: { ...blankRecap('w1:t1'), tasks: oneTask('## Waiting on you\n- answer me') } }, 60)), /needs you: answer me/);
});

test('a tab with one task is drawn exactly as before: no task heading, lanes then the one recap', () => {
    const recap: TabRecap = { ...blankRecap('w1:t1'), at: 0, tasks: [{ ...taskOf('t1', '', ['w1:p1', 'w1:p2']), sections: sections('one thing') }] };
    const text = strip(present({ tab: tab(LANES.slice(0, 2)), recap, notes: new Map(), warnings: [], now: 0, messages: en }, 50, () => null));
    assert.ok(!text.includes('▌'));
    assert.ok(text.indexOf('codex w1:p2') < text.indexOf('TAB RECAP') && text.indexOf('TAB RECAP') < text.indexOf('one thing'));
});
