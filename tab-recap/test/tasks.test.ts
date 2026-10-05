import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsRecapStore } from '#src/adapters/fs-recap-store.ts';
import { instructions, message } from '#src/adapters/recap-prompt.ts';
import { en } from '#src/i18n/en.ts';
import { es } from '#src/i18n/es.ts';
import { touchedFiles } from '#src/recap/application/lane-hints.ts';
import { RecapJob } from '#src/recap/application/recap-job.ts';
import { parseProposal } from '#src/recap/application/recap-tasks.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import { settle, unexplained } from '#src/recap/domain/tasks.ts';
import type { Proposal, RecapTask } from '#src/recap/domain/tasks.ts';
import { instant } from '#src/recap/domain/time.ts';
import { present, presentBar } from '#src/recap/render/present.ts';
import { groupsOf } from '#src/recap/render/groups.ts';
import { blankRecap } from '#src/ports/recap-store.ts';
import type { TabLane, TabRecap, TabView } from '#src/ports/recap-store.ts';
import type { LaneRepo } from '#src/ports/lane-repo.ts';
import type { RecapRequest, Summarizer, Written } from '#src/ports/summarizer.ts';
import type { ChunkResult, Located, PromptResult, Transcripts } from '#src/ports/transcripts.ts';
import { firstTask, oneTask } from '#test/support.ts';

const sections = (goal: string, rest: Partial<typeof NO_SECTIONS> = {}): typeof NO_SECTIONS => ({ ...NO_SECTIONS, goal, ...rest });
const proposal = (regroup: string, ...tasks: readonly (readonly [string, readonly string[], string])[]): Proposal =>
    ({ regroup, tasks: tasks.map(([name, lanes, goal]) => ({ name, lanes, sections: sections(goal) })) });
const taskOf = (id: string, name: string, lanes: readonly string[], goal = id): RecapTask => ({ id, name, lanes, sections: sections(goal), markdown: `## Goal\n${goal}` });

const P = ['w1:p1', 'w1:p2', 'w1:p10'];

// ── parsing ──────────────────────────────────────────────────────────────────────────────────────

test('parser: the seven sections alone are ONE task holding every lane — what a one-task tab has always answered', () => {
    const parsed = parseProposal('{"goal":"ship it","now":["CI"]}', P);
    assert.ok(parsed.kind === 'proposal');
    assert.deepEqual(parsed.proposal.tasks.map((task) => [task.name, task.lanes, task.sections.goal]), [['', P, 'ship it']]);
    assert.equal(parsed.proposal.regroup, '');
});

test('parser: tasks, each with its lanes (a pane id or a whole label) and its own seven sections, capped as ever', () => {
    const answer = JSON.stringify({
        regroup: '', tasks: [
            { name: 'Payments **API**', lanes: ['w1:p1', 'codex in w1:p10 — tests'], goal: 'one', now: Array.from({ length: 9 }, (_, i) => `n${i}`) },
            { name: 'x'.repeat(10), lanes: 'w1:p2', goal: 'two' },
        ],
    });
    const parsed = parseProposal(`here: ${answer}`, P);
    assert.ok(parsed.kind === 'proposal');
    const [first, second] = parsed.proposal.tasks;
    assert.deepEqual([first?.name, first?.lanes, first?.sections.now.length], ['Payments API', ['w1:p1', 'w1:p10'], 3], 'p1 is not p10, and the cap still applies');
    assert.deepEqual([second?.lanes, second?.sections.goal], [['w1:p2'], 'two']);
});

test('parser: a malformed grouping falls back to ONE task; an answer with no sections at all is invalid', () => {
    const fallback = parseProposal('{"tasks":"oops","goal":"whole","now":["a"]}', P);
    assert.ok(fallback.kind === 'proposal');
    assert.deepEqual(fallback.proposal.tasks.map((task) => [task.lanes, task.sections.goal]), [[P, 'whole']]);
    const empties = parseProposal('{"tasks":[1,null,{"name":"no sections"},[]],"goal":"top"}', P);
    assert.ok(empties.kind === 'proposal' && empties.proposal.tasks.length === 1 && empties.proposal.tasks[0]?.sections.goal === 'top');
    assert.equal(parseProposal('{"tasks":[{"name":"x"}]}', P).kind, 'invalid');
    assert.equal(parseProposal('not json {', P).kind, 'invalid');
    assert.equal(parseProposal('no object at all', P).kind, 'invalid');
});

// ── hysteresis ───────────────────────────────────────────────────────────────────────────────────

const two = [taskOf('t1', 'Payments', ['w1:p1', 'w1:p2']), taskOf('t2', 'Docs', ['w1:p10'])];

test('hysteresis: the same grouping keeps its ids and names, and takes the new sections', () => {
    const settled = settle(two, proposal('', ['', ['w1:p10'], 'docs v2'], ['Payments v2', ['w1:p2', 'w1:p1'], 'pay v2']), P);
    assert.deepEqual(settled.map((task) => [task.id, task.name, task.lanes, task.sections.goal]), [
        ['t2', 'Docs', ['w1:p10'], 'docs v2'], ['t1', 'Payments v2', ['w1:p2', 'w1:p1'], 'pay v2'],
    ]);
});

test('hysteresis: an AMBIGUOUS run — the writer moves a lane with no evidence — keeps the previous grouping, with the closest new text', () => {
    const merged = settle(two, proposal('', ['All of it', P, 'one big thing']), P);
    assert.deepEqual(merged.map((task) => [task.id, task.name, task.lanes]), [['t1', 'Payments', ['w1:p1', 'w1:p2']], ['t2', 'Docs', ['w1:p10']]]);
    assert.equal(unexplained(two, proposal('', ['All of it', P, 'x']), P), true);
    assert.equal(unexplained(two, proposal('they split', ['All of it', P, 'x']), P), false, 'evidence explains it');
    const moved = settle(two, proposal('', ['Payments', ['w1:p1'], 'pay'], ['Docs', ['w1:p2', 'w1:p10'], 'docs']), P);
    assert.deepEqual(moved.map((task) => [task.id, task.lanes, task.sections.goal]), [['t1', ['w1:p1', 'w1:p2'], 'pay'], ['t2', ['w1:p10'], 'docs']]);
});

test('hysteresis: a change WITH evidence is adopted — unchanged groups keep their ids, new ones get a fresh id', () => {
    const split = settle(two, proposal('p2 now works in another repo', ['Payments', ['w1:p1'], 'pay'], ['Spike', ['w1:p2'], 'spike'], ['Docs', ['w1:p10'], 'docs']), P);
    assert.deepEqual(split.map((task) => [task.id, task.name, task.lanes]), [['t1', 'Payments', ['w1:p1']], ['t3', 'Spike', ['w1:p2']], ['t2', 'Docs', ['w1:p10']]]);
});

test('lanes come and go without it being a regrouping: a closed lane leaves, a new lane joins the task the writer put it in', () => {
    const left = settle(two, proposal('', ['Payments', ['w1:p1'], 'pay'], ['Docs', ['w1:p10'], 'docs']), ['w1:p1', 'w1:p10']);
    assert.deepEqual(left.map((task) => [task.id, task.lanes]), [['t1', ['w1:p1']], ['t2', ['w1:p10']]]);
    const joined = settle(two, proposal('', ['Payments', ['w1:p1', 'w1:p2', 'w1:p3'], 'pay'], ['Docs', ['w1:p10'], 'docs']), [...P, 'w1:p3']);
    assert.deepEqual(joined.map((task) => [task.id, task.lanes]), [['t1', ['w1:p1', 'w1:p2', 'w1:p3']], ['t2', ['w1:p10']]]);
    const apart = settle(two, proposal('', ['Payments', ['w1:p1', 'w1:p2'], 'pay'], ['Docs', ['w1:p10'], 'docs'], ['Elsewhere', ['w1:p3'], 'new']), [...P, 'w1:p3']);
    assert.deepEqual(apart.map((task) => [task.id, task.name, task.lanes]).at(-1), ['t3', 'Elsewhere', ['w1:p3']], 'a new lane the writer set apart is a task of its own');
});

test('a tab with one task has no task name, however the writer named it; a lane nobody named joins the first task', () => {
    const one = settle([], proposal('', ['Named', ['w1:p1'], 'g']), ['w1:p1']);
    assert.deepEqual(one.map((task) => [task.id, task.name]), [['t1', '']]);
    const forgot = settle([], proposal('', ['A', ['w1:p1'], 'a'], ['B', ['w1:p2'], 'b']), P);
    assert.deepEqual(forgot.map((task) => task.lanes), [['w1:p1', 'w1:p10'], ['w1:p2']]);
    assert.deepEqual(settle([], proposal('', ['A', ['nowhere'], 'a']), P), [], 'a grouping that names no real lane settles to nothing');
});

// ── the prompt and the job ───────────────────────────────────────────────────────────────────────

test('the prompt asks for tasks only when the tab has several lanes, and carries the hints and the current grouping', () => {
    const base: RecapRequest = { previous: '', excerpt: 'x', language: 'en', previousLanguage: 'en', lanes: ['claude in w1:p1', 'codex in w1:p2'] };
    assert.ok(!instructions(base).includes('"tasks"') && !message(base).includes('AGENT HINTS'), 'no hints: exactly today\'s prompt');
    const many: RecapRequest = {
        ...base,
        hints: [
            { pane: 'w1:p1', label: 'claude in w1:p1', cwd: '/r/pay', repo: '/r/pay', branch: 'feat/v2', files: ['src/client.ts'] },
            { pane: 'w1:p2', label: 'codex in w1:p2', cwd: '/tmp', repo: null, branch: null, files: [] },
        ],
        grouping: [{ id: 't1', name: 'Payments', lanes: ['w1:p1'] }],
    };
    assert.ok(instructions(many).includes('"tasks"') && instructions(many).includes('"regroup"') && instructions(many).includes('KEEP the CURRENT TASKS'));
    const text = message(many);
    assert.ok(text.includes('- w1:p1 (claude in w1:p1): cwd /r/pay; repo /r/pay; branch feat/v2; edited src/client.ts'));
    assert.ok(text.includes('- w1:p2 (codex in w1:p2): cwd /tmp'));
    assert.ok(text.includes('CURRENT TASKS:\n- t1 "Payments": w1:p1'));
    assert.ok(message({ ...many, grouping: [] }).includes('(none yet — group the agents)'));
});

const tool = (text: string): { role: 'tool'; text: string } => ({ role: 'tool', text });

test('files touched are the distinct files of the edit tools, the most recent last, at most five', () => {
    assert.deepEqual(touchedFiles([tool('Edit: a.ts'), tool('Read: r.ts'), tool('Write: b.ts'), tool('Edit: a.ts'), { role: 'agent', text: 'Edit: no.ts' }]), ['b.ts', 'a.ts']);
    assert.equal(touchedFiles(Array.from({ length: 9 }, (_, i) => tool(`Edit: f${i}.ts`))).length, 5);
});

const transcripts: Transcripts = {
    agent: 'claude',
    locate: (lane): Promise<Located> => Promise.resolve({ kind: 'located', source: `/t/${lane.pane}` }),
    latestPrompt: (): Promise<PromptResult> => Promise.resolve({ kind: 'prompt', text: null }),
    read: (source: string): Promise<ChunkResult> => Promise.resolve({
        kind: 'chunk', entries: [{ role: 'tool', text: `Edit: ${source.slice(3)}.ts` }, { role: 'agent', text: `work in ${source.slice(3)}` }],
        title: null, lastPrompt: null, claudeRecap: null, position: { cursor: 5, tail: null }, grew: true,
    }),
};

class MemoryStore {
    recaps = new Map<string, TabRecap>();
    readRecap(tab: string): TabRecap | null { return this.recaps.get(tab) ?? null; }
    writeRecap(recap: TabRecap): void { this.recaps.set(recap.tab, recap); }
    readTab(): TabView | null { return null; }
    writeTab(): void { /* not needed */ }
    request(): void { /* not needed */ }
    takeRequests(): readonly never[] { return []; }
    readHidden(): { all: boolean; hidden: string[]; shown: string[] } { return { all: false, hidden: [], shown: [] }; }
    writeHidden(): void { /* not needed */ }
    requestVisibility(): void { /* not needed */ }
    takeVisibility(): readonly never[] { return []; }
}

const repos: LaneRepo = { repoOf: (cwd) => Promise.resolve(cwd === '/work/pay' ? { kind: 'repo', root: '/work/pay', branch: 'feat/v2' } : { kind: 'no-repo' }) };

async function run(answers: readonly string[], lanes: readonly string[], store = new MemoryStore()): Promise<{ store: MemoryStore; requests: RecapRequest[] }> {
    const requests: RecapRequest[] = [];
    const summarizer: Summarizer = { backend: 'fake', write: (request): Promise<Written> => { requests.push(request); return Promise.resolve({ kind: 'written', text: answers[Math.min(requests.length - 1, answers.length - 1)] ?? '', costUsd: 0 }); } };
    const job = new RecapJob({ transcripts: [transcripts], store, repos, clock: { now: (): ReturnType<typeof instant> => instant(1) }, summarizer: (): Summarizer => summarizer, language: (): string => 'en', log: (): void => undefined });
    job.request(tabId('w1:t1'), lanes.map((pane) => laneFrom({ paneId: pane, tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's', cwd: pane === 'w1:p1' ? '/work/pay' : '/work/docs' })), 'requested');
    await new Promise((resolve) => { setTimeout(resolve, 40); });
    return { store, requests };
}

test('a tab with two lanes: the request carries each lane\'s hints and the previous grouping; the answer is stored as tasks, each with its drawn Markdown', async () => {
    const answer = JSON.stringify({ regroup: '', tasks: [{ name: 'Payments', lanes: ['w1:p1'], goal: 'pay v2', now: ['wiring'] }, { name: 'Docs', lanes: ['w1:p2'], goal: 'docs' }] });
    const { store, requests } = await run([answer], ['w1:p1', 'w1:p2']);
    const [request] = requests;
    assert.ok(request !== undefined);
    assert.deepEqual(request.hints?.map((hint) => [hint.pane, hint.cwd, hint.repo, hint.branch, hint.files]), [
        ['w1:p1', '/work/pay', '/work/pay', 'feat/v2', ['w1:p1.ts']], ['w1:p2', '/work/docs', null, null, ['w1:p2.ts']],
    ]);
    assert.deepEqual(request.grouping, []);
    const recap = store.readRecap('w1:t1');
    assert.deepEqual(recap?.tasks.map((task) => [task.id, task.name, task.lanes, task.sections?.goal]), [['t1', 'Payments', ['w1:p1'], 'pay v2'], ['t2', 'Docs', ['w1:p2'], 'docs']]);
    assert.match(firstTask(recap).markdown, /^## Goal\npay v2\n\n## Now\n- wiring/);
});

test('a tab with ONE lane is not asked to group: no hints, and the answer is one unnamed task', async () => {
    const { store, requests } = await run([JSON.stringify({ goal: 'solo' })], ['w1:p1']);
    assert.equal(requests[0]?.hints, undefined);
    assert.equal(requests[0]?.grouping, undefined);
    assert.deepEqual(store.readRecap('w1:t1')?.tasks.map((task) => [task.id, task.name, task.lanes, task.sections?.goal]), [['t1', '', ['w1:p1'], 'solo']]);
});

test('the second run: the previous grouping goes back to the writer, and an ambiguous answer does not move a lane', async () => {
    const first = JSON.stringify({ tasks: [{ name: 'Payments', lanes: ['w1:p1'], goal: 'a' }, { name: 'Docs', lanes: ['w1:p2'], goal: 'b' }] });
    const merged = JSON.stringify({ regroup: '', tasks: [{ name: 'Everything', lanes: ['w1:p1', 'w1:p2'], goal: 'c' }] });
    const store = new MemoryStore();
    await run([first], ['w1:p1', 'w1:p2'], store);
    const { requests } = await run([merged], ['w1:p1', 'w1:p2'], store);
    assert.equal(requests.length, 2, 'asked once more, saying what was wrong');
    assert.match(requests[1]?.correction ?? '', /without saying why/);
    assert.deepEqual(requests[0]?.grouping, [{ id: 't1', name: 'Payments', lanes: ['w1:p1'] }, { id: 't2', name: 'Docs', lanes: ['w1:p2'] }]);
    assert.match(requests[0].previous, /^\{"tasks":\[\{"id":"t1","name":"Payments","lanes":\["w1:p1"\],"recap":\{"goal":"a"/);
    assert.deepEqual(store.readRecap('w1:t1')?.tasks.map((task) => [task.id, task.name, task.lanes]), [['t1', 'Payments', ['w1:p1']], ['t2', 'Docs', ['w1:p2']]]);
    const evidence = JSON.stringify({ regroup: 'both now work in the docs repo', tasks: [{ name: 'Docs sprint', lanes: ['w1:p1', 'w1:p2'], goal: 'd' }] });
    await run([evidence], ['w1:p1', 'w1:p2'], store);
    assert.deepEqual(store.readRecap('w1:t1')?.tasks.map((task) => [task.name, task.lanes]), [['', ['w1:p1', 'w1:p2']]], 'with evidence the grouping changes (and one task has no name)');
});

test('tasks round-trip through the store; a task with no sections keeps its Markdown', () => {
    const dir = mkdtempSync(join(tmpdir(), 'recap-tasks-'));
    try {
        const store = new FsRecapStore(dir);
        const tasks = [taskOf('t1', 'Payments', ['w1:p1']), { id: 't2', name: 'Docs', lanes: ['w1:p2'], sections: null, markdown: '## Goal\n- old' }];
        store.writeRecap({ ...blankRecap('w1:t1'), tasks });
        assert.deepEqual(store.readRecap('w1:t1')?.tasks, tasks);
    } finally {
        rmSync(dir, { recursive: true });
    }
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
