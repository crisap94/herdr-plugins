import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RecapJob } from '#src/recap/application/recap-job.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { instant } from '#src/recap/domain/time.ts';
import { memoryStore, seed } from '#test/db/support.ts';
import { firstTask, NO_REPOS, oneTask } from '#test/support.ts';
import { blankRecap } from '#src/ports/recap-records.ts';
import type { TabRecap } from '#src/ports/recap-records.ts';
import type { RecapRequest, Summarizer, Written } from '#src/ports/summarizer.ts';
import type { ChunkResult, Located, PromptResult, Transcripts } from '#src/ports/transcripts.ts';

const add = (section: string, text: string): Record<string, unknown> => ({ op: 'add', section, text, anchor: 'migrate victoria' });
const answer = (...ops: readonly Record<string, unknown>[]): string => JSON.stringify({ ops });

const said: Record<string, string> = { 'w1:p1': 'migrate victoria', 'w1:p2': 'run the tests' };

function transcriptsOf(agent: string): Transcripts {
    return {
        agent,
        locate: (lane: Lane): Promise<Located> => Promise.resolve({ kind: 'located', source: `/t/${lane.pane}` }),
        latestPrompt: (): Promise<PromptResult> => Promise.resolve({ kind: 'prompt', text: null }),
        read: (source: string): Promise<ChunkResult> => {
            const pane = source.slice(3);
            return Promise.resolve({ kind: 'chunk', entries: [{ role: 'user', text: said[pane] ?? '' }], title: null, lastPrompt: said[pane] ?? null, claudeRecap: null, notes: [], position: { cursor: 100, tail: null }, grew: true });
        },
    };
}

test('one recap for the tab, written from every lane, advancing every cursor', async () => {
    const requests: RecapRequest[] = [];
    const summarizer: Summarizer = {
        backend: 'fake',
        write: (request: RecapRequest): Promise<Written> => { requests.push(request); return Promise.resolve({ kind: 'written', text: JSON.stringify({ ops: [add('goal', 'both'), add('now', 'migrating')] }), costUsd: 0.01 }); },
    };
    const store = memoryStore();
    const job = new RecapJob({ repos: NO_REPOS,
        transcripts: [transcriptsOf('claude'), transcriptsOf('codex')],
        records: store.records, ledger: store.ledger, clock: { now: (): ReturnType<typeof instant> => instant(5) }, summarizer: (): Summarizer => summarizer, language: (): string => 'en', log: (): void => undefined,
    });
    const lanes = [
        laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's1' }),
        laneFrom({ paneId: 'w1:p2', tabId: 'w1:t1', workspaceId: 'w1', agent: 'codex' }),
    ];
    job.request(tabId('w1:t1'), lanes, 'requested');
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    const [only] = requests;
    assert.equal(requests.length, 1, 'one summarizer call for the whole tab');
    assert.ok(only !== undefined);
    assert.deepEqual(only.input.agents.map((agent) => [agent.id, agent.kind, agent.pane]), [['a1', 'claude', 'w1:p1'], ['a2', 'codex', 'w1:p2']], 'every lane is described, hints included');
    assert.deepEqual(only.input.transcripts.map((lane) => [lane.agent, lane.entries.map((entry) => entry.text)]), [['a1', ['migrate victoria']], ['a2', ['run the tests']]]);
    const recap = store.records.readRecap('w1:t1');
    assert.ok(recap !== null);
    assert.deepEqual(firstTask(recap).sections, { goal: 'both', now: ['migrating'], needs: [], done: [], decisions: [], next: [], links: [], rules: [] });
    assert.match(firstTask(recap).markdown, /^## Goal\nboth\n\n## Now\n- migrating\n\n## Needs you\n—/);
    assert.deepEqual(recap.lanes.map((c) => [c.pane, c.cursor]), [['w1:p1', 100], ['w1:p2', 100]]);
});

const quiet: Transcripts = {
    agent: 'claude',
    locate: (lane: Lane): Promise<Located> => Promise.resolve({ kind: 'located', source: `/t/${lane.pane}` }),
    latestPrompt: (): Promise<PromptResult> => Promise.resolve({ kind: 'prompt', text: null }),
    read: (): Promise<ChunkResult> => Promise.resolve({ kind: 'chunk', entries: [], title: null, lastPrompt: null, claudeRecap: null, notes: [], position: { cursor: 100, tail: null }, grew: false }),
};

async function rewriteWith(language: string, stored: string | undefined, cause: 'requested' | 'focused'): Promise<{ calls: RecapRequest[]; recap: TabRecap | null }> {
    const calls: RecapRequest[] = [];
    const summarizer: Summarizer = {
        backend: 'fake',
        write: (request: RecapRequest): Promise<Written> => { calls.push(request); return Promise.resolve({ kind: 'written', text: answer({ op: 'update', id: 'f1', text: 'hecho' }), costUsd: 0 }); },
    };
    const store = memoryStore();
    const lane = laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's1' });
    const base = blankRecap('w1:t1');
    seed(store, {
        ...base, tasks: oneTask('## Goal\n- migrate', { goal: 'migrate', now: [], needs: [], done: [], decisions: [], next: [], links: [], rules: [] }), at: 1,
        lanes: [{ pane: 'w1:p1', agent: 'claude', transcript: '/t/w1:p1', cursor: 100, tail: null, title: null, lastPrompt: null, claudeRecap: null }],
        ...(stored === undefined ? {} : { language: stored }),
    });
    const job = new RecapJob({ repos: NO_REPOS,
        transcripts: [quiet], records: store.records, ledger: store.ledger, clock: { now: (): ReturnType<typeof instant> => instant(9) }, summarizer: (): Summarizer => summarizer,
        language: (): string => language, log: (): void => undefined,
    });
    job.request(tabId('w1:t1'), [lane], cause);
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    return { calls, recap: store.records.readRecap('w1:t1') };
}

test('a language switch with nothing new REWRITES the recap — on a request and on a focus', async () => {
    for (const cause of ['requested', 'focused'] as const) {
        const { calls, recap } = await rewriteWith('es', 'en', cause);
        assert.equal(calls.length, 1, `${cause}: the early return is bypassed`);
        const [first] = calls;
        assert.deepEqual([first?.language, first?.previousLanguage, first?.input.transcripts.flatMap((lane) => lane.entries).length], ['es', 'en', 0]);
        assert.equal(recap?.language, 'es');
        assert.equal(firstTask(recap).sections?.goal, 'hecho');
        assert.match(firstTask(recap).markdown, /^## Objetivo\nhecho/);
    }
});

test('the same language with nothing new does NOT call the summarizer (no cost for nothing)', async () => {
    for (const cause of ['requested', 'focused'] as const) {
        const { calls } = await rewriteWith('en', 'en', cause);
        assert.equal(calls.length, 0, cause);
    }
});

test('a recap stored before languages existed counts as English; a failed rewrite keeps the old language so it is retried', async () => {
    const legacy = await rewriteWith('es', undefined, 'requested');
    assert.equal(legacy.calls[0]?.previousLanguage, 'en');
    const failing: Summarizer = { backend: 'fake', write: (): Promise<Written> => Promise.resolve({ kind: 'unknown', why: { why: 'failed', code: 1, detail: 'x' } }) };
    const store = memoryStore();
    const lane = laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's1' });
    seed(store, { ...blankRecap('w1:t1'), tasks: oneTask('## Goal\n- m'), at: 1, language: 'en' });
    const job = new RecapJob({ repos: NO_REPOS, transcripts: [quiet], records: store.records, ledger: store.ledger, clock: { now: (): ReturnType<typeof instant> => instant(9) }, summarizer: (): Summarizer => failing, language: (): string => 'es', log: (): void => undefined });
    job.request(tabId('w1:t1'), [lane], 'requested');
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    assert.equal(store.records.readRecap('w1:t1')?.language, 'en');
});

function scriptedWriter(answers: readonly string[]): { summarizer: Summarizer; calls: RecapRequest[] } {
    const calls: RecapRequest[] = [];
    const summarizer: Summarizer = {
        backend: 'fake',
        write: (request: RecapRequest): Promise<Written> => {
            calls.push(request);
            return Promise.resolve({ kind: 'written', text: answers[Math.min(calls.length - 1, answers.length - 1)] ?? '', costUsd: 0.5 });
        },
    };
    return { summarizer, calls };
}

async function recapWith(answers: readonly string[], stored: Partial<TabRecap> = {}): Promise<{ calls: RecapRequest[]; recap: TabRecap }> {
    const { summarizer, calls } = scriptedWriter(answers);
    const store = memoryStore();
    seed(store, { ...blankRecap('w1:t1'), ...stored });
    const job = new RecapJob({ repos: NO_REPOS,
        transcripts: [transcriptsOf('claude')], records: store.records, ledger: store.ledger, clock: { now: (): ReturnType<typeof instant> => instant(7) }, summarizer: (): Summarizer => summarizer,
        language: (): string => 'en', log: (): void => undefined,
    });
    job.request(tabId('w1:t1'), [laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's1' })], 'requested');
    await new Promise((resolve) => { setTimeout(resolve, 30); });
    const recap = store.records.readRecap('w1:t1');
    assert.ok(recap !== null);
    return { calls, recap };
}

test('an unusable answer is retried ONCE with what was wrong; the second answer is used; both cost', async () => {
    const { calls, recap } = await recapWith(['sorry, no', answer(add('goal', 'second try'), add('now', 'ok'))]);
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.correction, undefined);
    assert.match(calls[1]?.correction ?? '', /no JSON object/);
    assert.equal(firstTask(recap).sections?.goal, 'second try');
    assert.equal(recap.error, null);
    assert.equal(recap.costUsd, 1);
});

test('two unusable answers keep the previous recap, add an error line and do not advance the cursors', async () => {
    const previous = { goal: 'old goal', now: ['old'], needs: [], done: [], decisions: [], next: [], links: [], rules: [] };
    const { calls, recap } = await recapWith(['nope', '{"foo": 1}'], { tasks: oneTask('## Goal\nold goal', previous), at: 1 });
    assert.equal(calls.length, 2, 'one retry, not more');
    assert.deepEqual(firstTask(recap).sections, previous);
    assert.match(firstTask(recap).markdown, /^## Goal\nold goal\n\n## Now\n- old/, 'the Markdown is drawn from the stored facts');
    assert.match(recap.error ?? '', /not usable.*ledger is unchanged/);
    assert.equal(recap.at, 1, 'the ledger was not written');
    assert.deepEqual(recap.lanes.map((lane) => lane.cursor), [0], 'the transcript is read again next time');
    assert.equal(recap.running, false);
});

test('the ledger goes to the writer: the open facts numbered f1…fn, oldest seen first; the answer\'s ids are mapped back to them', async () => {
    const sections = { goal: 'g', now: ['n'], needs: [], done: [], decisions: [], next: [], links: [], rules: [] };
    const first = await recapWith([answer({ op: 'close', id: 'f2', why: 'done' }, add('done', 'finished n'))], { tasks: oneTask('rendered', sections, ['w1:p1']), at: 1 });
    const facts = first.calls[0]?.input.ledgers.flatMap((ledger) => ledger.facts.map((fact) => [fact.id, fact.section, fact.text, fact.state]));
    assert.deepEqual(facts, [['f1', 'goal', 'g', 'open'], ['f2', 'now', 'n', 'open']]);
    const task = firstTask(first.recap);
    assert.deepEqual([task.sections?.now, task.sections?.done], [[], ['finished n']], 'f2 was closed as done and a new fact added');
});

test('a tab with no facts yet sends an empty ledger; a writer that answers nothing new leaves the ledger as it was', async () => {
    const empty = await recapWith([answer()]);
    assert.deepEqual(empty.calls[0]?.input.ledgers, [{ task: null, facts: [] }]);
    assert.equal(empty.recap.error, null);
    assert.equal(firstTask(empty.recap).sections?.goal, '');
});

test('the 1.x answer (a recap, not operations) is told so and may fix it; a custom writer that gives it fails with the contract line', async () => {
    const fixed = await recapWith([JSON.stringify({ goal: 'old shape' }), answer(add('goal', 'ops now'))]);
    assert.match(fixed.calls[1]?.correction ?? '', /answer operations on the ledger only/);
    assert.equal(firstTask(fixed.recap).sections?.goal, 'ops now');
    const calls: RecapRequest[] = [];
    const custom: Summarizer = { backend: 'custom/mine', write: (request: RecapRequest): Promise<Written> => { calls.push(request); return Promise.resolve({ kind: 'written', text: JSON.stringify({ goal: 'x' }), costUsd: 0 }); } };
    const store = memoryStore();
    const lane = laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's1' });
    new RecapJob({ repos: NO_REPOS, transcripts: [transcriptsOf('claude')], records: store.records, ledger: store.ledger, clock: { now: (): ReturnType<typeof instant> => instant(7) }, summarizer: (): Summarizer => custom, language: (): string => 'en', log: (): void => undefined })
        .request(tabId('w1:t1'), [lane], 'requested');
    await new Promise((resolve) => { setTimeout(resolve, 30); });
    assert.equal(calls.length, 1, 'no retry for a custom writer');
    assert.match(store.records.readRecap('w1:t1')?.error ?? '', /custom writer must answer operations \(see README\)/);
    assert.equal(store.ledger.allOf({ tab: 'w1:t1', key: 't1' }).length, 0, 'nothing stored');
});

test('a harness that fails outright is not retried', async () => {
    const calls: RecapRequest[] = [];
    const failing: Summarizer = { backend: 'fake', write: (request: RecapRequest): Promise<Written> => { calls.push(request); return Promise.resolve({ kind: 'unknown', why: { why: 'timeout', after: 5 as never } }); } };
    const store = memoryStore();
    const job = new RecapJob({ repos: NO_REPOS, transcripts: [transcriptsOf('claude')], records: store.records, ledger: store.ledger, clock: { now: (): ReturnType<typeof instant> => instant(7) }, summarizer: (): Summarizer => failing, language: (): string => 'en', log: (): void => undefined });
    job.request(tabId('w1:t1'), [laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's1' })], 'requested');
    await new Promise((resolve) => { setTimeout(resolve, 30); });
    assert.equal(calls.length, 1);
});

test('refreshNow resolves only once the recap of the tab has been written', async () => {
    const summarizer: Summarizer = {
        backend: 'fake',
        write: (): Promise<Written> => new Promise((resolve) => { setTimeout(() => { resolve({ kind: 'written', text: answer({ ...add('goal', 'written late'), anchor: 'go' }), costUsd: 0 }); }, 30); }),
    };
    const store = memoryStore();
    const lane = laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's1' });
    const reader: Transcripts = { ...quiet, read: (): Promise<ChunkResult> => Promise.resolve({ kind: 'chunk', entries: [{ role: 'user', text: 'go' }], title: null, lastPrompt: null, claudeRecap: null, notes: [], position: { cursor: 5, tail: null }, grew: true }) };
    const job = new RecapJob({ repos: NO_REPOS, transcripts: [reader], records: store.records, ledger: store.ledger, clock: { now: (): ReturnType<typeof instant> => instant(9) }, summarizer: (): Summarizer => summarizer, language: (): string => 'en', log: (): void => undefined });
    await job.refreshNow(tabId('w1:t1'), [lane]);
    assert.equal(firstTask(store.records.readRecap('w1:t1') ?? blankRecap('w1:t1')).sections?.goal, 'written late');
});
