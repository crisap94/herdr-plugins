import { textOf } from '@stateforge-labs/session-ledger';
import { checkedLedger, checkedRecords } from '#src/ports/guarded-reads.ts';
import { test } from 'node:test';
import { registryWith } from '#test/fakes/transcript-registry.ts';
import assert from 'node:assert/strict';
import { RecapJob } from '@stateforge-labs/session-ledger';
import { tabId, agentKind, paneId } from '#test/support/ids.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { FollowedSession } from '#src/recap/domain/lane.ts';
import { instant } from '@stateforge-labs/session-ledger';
import type { CloseEvidence } from '@stateforge-labs/session-ledger';
import { memoryStore, seed, storeRead } from '#test/db/support.ts';
import { firstTask, NO_REPOS, oneTask } from '#test/support.ts';
import { blankRecap } from '@stateforge-labs/session-ledger';
import type { Recap } from '@stateforge-labs/session-ledger';
import type { RecapRequest, Written } from '@stateforge-labs/session-ledger';
import type { LegacyWriter as Writer } from '@stateforge-labs/session-ledger';
import type { ChunkResult, Located, PromptResult } from '@stateforge-labs/session-ledger';
import type { LegacySessionReader as SessionReader } from '@stateforge-labs/session-ledger';
import { causeOf } from './fakes/cause.ts';
import { mintFactId } from '#src/adapters/db/ledger-rows.ts';
import { brand } from '@stateforge-labs/session-ledger';
import type { Text } from '@stateforge-labs/session-ledger';
import { cursorOf, grewOf, sourcePathOf } from '@stateforge-labs/session-ledger';
import { exitCodeOf } from '@stateforge-labs/session-ledger';
import { tabIdOf } from '#src/recap/domain/ids.ts';
import { seenLane } from '#test/support/seen.ts';

const add = (section: string, text: string): Record<string, unknown> => ({ op: 'add', section, text, anchor: 'migrate victoria' });
const answer = (...ops: readonly Record<string, unknown>[]): string => JSON.stringify({ ops });

const said: Record<string, string> = { 'w1:p1': 'migrate victoria', 'w1:p2': 'run the tests' };

function transcriptsOf(agent: string): SessionReader {
    return {
        agent: agentKind(agent),
        inFlight: { kind: 'unsupported', why: 'unregistered-reader' },
        locate: (lane: FollowedSession): Promise<Located> => Promise.resolve({ kind: 'located', source: sourcePathOf(`/t/${lane.pane}`) }),
        latestPrompt: (): Promise<PromptResult> => Promise.resolve({ kind: 'prompt', text: null }),
        read: (source: string): Promise<ChunkResult> => {
            const pane = source.slice(3);
            return Promise.resolve({ kind: 'chunk', entries: [{ role: 'user', text: textOf(said[pane] ?? '') }], title: null, lastPrompt: said[pane] === undefined ? null : textOf(said[pane]), harnessRecap: null, notes: [], position: { cursor: cursorOf(100), tail: null }, grew: grewOf(true) });
        },
    };
}

test('one recap for the tab, written from every lane, advancing every cursor', async () => {
    const requests: RecapRequest[] = [];
    const summarizer: Writer = {
        backend: textOf('fake'),
        contract: 'strict',
        write: (request: RecapRequest): Promise<Written> => { requests.push(request); return Promise.resolve({ kind: 'written', text: textOf(JSON.stringify({ ops: [add('goal', 'both'), add('now', 'migrating')] })), costUsd: brand<number, 'Usd'>(0.01) }); },
    };
    const store = memoryStore();
    const job = new RecapJob({ writerView: (): { readonly kind: 'full' } => ({ kind: 'full' }), mint: mintFactId, repos: NO_REPOS,
        transcripts: registryWith({ claude: transcriptsOf('claude'), codex: transcriptsOf('codex') }),
        records: checkedRecords(store.records), ledger: checkedLedger(store.ledger), clock: { now: (): ReturnType<typeof instant> => instant(5) }, summarizer: (): Writer => summarizer, language: (): Text => brand<string, 'Text'>('en'), log: (): void => undefined,
    });
    const lanes = [
        laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's1' })),
        laneFrom(seenLane({ paneId: 'w1:p2', tabId: 'w1:t1', workspaceId: 'w1', agent: 'codex' })),
    ];
    job.request(tabId('w1:t1'), lanes, 'requested');
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    const [only] = requests;
    assert.equal(requests.length, 1, 'one summarizer call for the whole tab');
    assert.ok(only !== undefined);
    assert.deepEqual(only.input.agents.map((agent) => [agent.id, agent.kind, agent.key]), [['a1', 'claude', 'w1:p1'], ['a2', 'codex', 'w1:p2']], 'every lane is described, hints included');
    assert.deepEqual(only.input.transcripts.map((lane) => [lane.agent, lane.entries.map((entry) => entry.text)]), [['a1', ['migrate victoria']], ['a2', ['run the tests']]]);
    const recap = storeRead(store.records.readRecap(tabId('w1:t1')));
    assert.ok(recap !== null);
    assert.deepEqual(firstTask(recap).sections, { goal: 'both', now: ['migrating'], needs: [], done: [], decisions: [], next: [], links: [], rules: [] });
    assert.match(firstTask(recap).markdown, /^## Goal\nboth\n\n## Now\n- migrating\n\n## Needs you\n—/);
    assert.deepEqual(recap.sessions.map((c) => [c.key, c.cursor]), [['w1:p1', 100], ['w1:p2', 100]]);
});

const quiet: SessionReader = {
    agent: agentKind('claude'),
    inFlight: { kind: 'unsupported', why: 'unregistered-reader' },
    locate: (lane: FollowedSession): Promise<Located> => Promise.resolve({ kind: 'located', source: sourcePathOf(`/t/${lane.pane}`) }),
    latestPrompt: (): Promise<PromptResult> => Promise.resolve({ kind: 'prompt', text: null }),
    read: (): Promise<ChunkResult> => Promise.resolve({ kind: 'chunk', entries: [], title: null, lastPrompt: null, harnessRecap: null, notes: [], position: { cursor: cursorOf(100), tail: null }, grew: grewOf(false) }),
};

async function rewriteWith(language: string, stored: string | undefined, cause: 'requested' | 'focused'): Promise<{ calls: RecapRequest[]; recap: Recap | null }> {
    const calls: RecapRequest[] = [];
    const summarizer: Writer = {
        backend: textOf('fake'),
        contract: 'strict',
        write: (request: RecapRequest): Promise<Written> => { calls.push(request); return Promise.resolve({ kind: 'written', text: textOf(answer({ op: 'update', id: 'f1', text: 'hecho' })), costUsd: brand<number, 'Usd'>(0) }); },
    };
    const store = memoryStore();
    const lane = laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's1' }));
    const base = blankRecap(tabId('w1:t1'));
    seed(store, {
        ...base, tasks: oneTask('## Goal\n- migrate', { goal: textOf('migrate'), now: [], needs: [], done: [], decisions: [], next: [], links: [], rules: [] }), at: instant(1),
        sessions: [{ key: paneId('w1:p1'), agent: agentKind('claude'), transcript: sourcePathOf('/t/w1:p1'), cursor: cursorOf(100), tail: null, title: null, lastPrompt: null, harnessRecap: null }],
        ...(stored === undefined ? {} : { language: textOf(stored) }),
    });
    const job = new RecapJob({ writerView: (): { readonly kind: 'full' } => ({ kind: 'full' }), mint: mintFactId, repos: NO_REPOS,
        transcripts: registryWith({ claude: quiet }), records: checkedRecords(store.records), ledger: checkedLedger(store.ledger), clock: { now: (): ReturnType<typeof instant> => instant(9) }, summarizer: (): Writer => summarizer,
        language: (): Text => brand<string, 'Text'>(language), log: (): void => undefined,
    });
    job.request(tabId('w1:t1'), [lane], cause);
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    return { calls, recap: storeRead(store.records.readRecap(tabId('w1:t1'))) };
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
    const failing: Writer = { backend: textOf('fake'), contract: 'strict', write: (): Promise<Written> => Promise.resolve({ kind: 'unknown', why: { why: 'failed', code: exitCodeOf(1), detail: causeOf('x') } }) };
    const store = memoryStore();
    const lane = laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's1' }));
    seed(store, { ...blankRecap(tabId('w1:t1')), tasks: oneTask('## Goal\n- m'), at: instant(1), language: textOf('en') });
    const job = new RecapJob({ writerView: (): { readonly kind: 'full' } => ({ kind: 'full' }), mint: mintFactId, repos: NO_REPOS, transcripts: registryWith({ claude: quiet }), records: checkedRecords(store.records), ledger: checkedLedger(store.ledger), clock: { now: (): ReturnType<typeof instant> => instant(9) }, summarizer: (): Writer => failing, language: (): Text => brand<string, 'Text'>('es'), log: (): void => undefined });
    job.request(tabId('w1:t1'), [lane], 'requested');
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    assert.equal(storeRead(store.records.readRecap(tabId('w1:t1')))?.language, 'en');
});

function scriptedWriter(answers: readonly string[]): { summarizer: Writer; calls: RecapRequest[] } {
    const calls: RecapRequest[] = [];
    const summarizer: Writer = {
        backend: textOf('fake'),
        contract: 'strict',
        write: (request: RecapRequest): Promise<Written> => {
            calls.push(request);
            return Promise.resolve({ kind: 'written', text: textOf(answers[Math.min(calls.length - 1, answers.length - 1)] ?? ''), costUsd: brand<number, 'Usd'>(0.5) });
        },
    };
    return { summarizer, calls };
}

async function recapWith(answers: readonly string[], stored: Partial<Recap> = {}): Promise<{ calls: RecapRequest[]; recap: Recap }> {
    const { summarizer, calls } = scriptedWriter(answers);
    const store = memoryStore();
    seed(store, { ...blankRecap(tabId('w1:t1')), ...stored });
    const job = new RecapJob({ writerView: (): { readonly kind: 'full' } => ({ kind: 'full' }), mint: mintFactId, repos: NO_REPOS,
        transcripts: registryWith({ claude: transcriptsOf('claude') }), records: checkedRecords(store.records), ledger: checkedLedger(store.ledger), clock: { now: (): ReturnType<typeof instant> => instant(7) }, summarizer: (): Writer => summarizer,
        language: (): Text => brand<string, 'Text'>('en'), log: (): void => undefined,
    });
    job.request(tabId('w1:t1'), [laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's1' }))], 'requested');
    await new Promise((resolve) => { setTimeout(resolve, 30); });
    const recap = storeRead(store.records.readRecap(tabId('w1:t1')));
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
    const previous = { goal: textOf('old goal'), now: [textOf('old')], needs: [], done: [], decisions: [], next: [], links: [], rules: [] };
    const { calls, recap } = await recapWith(['nope', '{"foo": 1}'], { tasks: oneTask('## Goal\nold goal', previous), at: instant(1) });
    assert.equal(calls.length, 2, 'one retry, not more');
    assert.deepEqual(firstTask(recap).sections, previous);
    assert.match(firstTask(recap).markdown, /^## Goal\nold goal\n\n## Now\n- old/, 'the Markdown is drawn from the stored facts');
    assert.match(recap.error ?? '', /not usable.*ledger is unchanged/);
    assert.equal(recap.at, 1, 'the ledger was not written');
    assert.deepEqual(recap.sessions.map((lane) => lane.cursor), [0], 'the transcript is read again next time');
    assert.equal(recap.running, false);
});

test('the ledger goes to the writer: the open facts numbered f1…fn, oldest seen first; the answer\'s ids are mapped back to them', async () => {
    const sections = { goal: textOf('g'), now: [textOf('n')], needs: [], done: [], decisions: [], next: [], links: [], rules: [] };
    const first = await recapWith([answer({ op: 'close', id: 'f2', why: 'done' }, add('done', 'finished n'))], { tasks: oneTask('rendered', sections, ['w1:p1']), at: instant(1) });
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
    const custom: Writer = { backend: textOf('custom/mine'), contract: 'free-text', write: (request: RecapRequest): Promise<Written> => { calls.push(request); return Promise.resolve({ kind: 'written', text: textOf(JSON.stringify({ goal: 'x' })), costUsd: brand<number, 'Usd'>(0) }); } };
    const store = memoryStore();
    const lane = laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's1' }));
    new RecapJob({ writerView: (): { readonly kind: 'full' } => ({ kind: 'full' }), mint: mintFactId, repos: NO_REPOS, transcripts: registryWith({ claude: transcriptsOf('claude') }), records: checkedRecords(store.records), ledger: checkedLedger(store.ledger), clock: { now: (): ReturnType<typeof instant> => instant(7) }, summarizer: (): Writer => custom, language: (): Text => brand<string, 'Text'>('en'), log: (): void => undefined })
        .request(tabId('w1:t1'), [lane], 'requested');
    await new Promise((resolve) => { setTimeout(resolve, 30); });
    assert.equal(calls.length, 1, 'no retry for a custom writer');
    assert.match(storeRead(store.records.readRecap(tabId('w1:t1')))?.error ?? '', /custom writer must answer operations \(see README\)/);
    assert.equal(storeRead(store.ledger.allOf({ scope: tabIdOf('w1:t1'), key: textOf('t1') })).length, 0, 'nothing stored');
});

test('a harness that fails outright is not retried', async () => {
    const calls: RecapRequest[] = [];
    const failing: Writer = { backend: textOf('fake'), contract: 'strict', write: (request: RecapRequest): Promise<Written> => { calls.push(request); return Promise.resolve({ kind: 'unknown', why: { why: 'timeout', after: 5 as never } }); } };
    const store = memoryStore();
    const job = new RecapJob({ writerView: (): { readonly kind: 'full' } => ({ kind: 'full' }), mint: mintFactId, repos: NO_REPOS, transcripts: registryWith({ claude: transcriptsOf('claude') }), records: checkedRecords(store.records), ledger: checkedLedger(store.ledger), clock: { now: (): ReturnType<typeof instant> => instant(7) }, summarizer: (): Writer => failing, language: (): Text => brand<string, 'Text'>('en'), log: (): void => undefined });
    job.request(tabId('w1:t1'), [laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's1' }))], 'requested');
    await new Promise((resolve) => { setTimeout(resolve, 30); });
    assert.equal(calls.length, 1);
});

test('refreshNow resolves only once the recap of the tab has been written', async () => {
    const summarizer: Writer = {
        backend: textOf('fake'),
        contract: 'strict',
        write: (): Promise<Written> => new Promise((resolve) => { setTimeout(() => { resolve({ kind: 'written', text: textOf(answer({ ...add('goal', 'written late'), anchor: 'go' })), costUsd: brand<number, 'Usd'>(0) }); }, 30); }),
    };
    const store = memoryStore();
    const lane = laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's1' }));
    const reader: SessionReader = { ...quiet, read: (): Promise<ChunkResult> => Promise.resolve({ kind: 'chunk', entries: [{ role: 'user', text: textOf('go') }], title: null, lastPrompt: null, harnessRecap: null, notes: [], position: { cursor: cursorOf(5), tail: null }, grew: grewOf(true) }) };
    const job = new RecapJob({ writerView: (): { readonly kind: 'full' } => ({ kind: 'full' }), mint: mintFactId, repos: NO_REPOS, transcripts: registryWith({ [reader.agent]: reader }), records: checkedRecords(store.records), ledger: checkedLedger(store.ledger), clock: { now: (): ReturnType<typeof instant> => instant(9) }, summarizer: (): Writer => summarizer, language: (): Text => brand<string, 'Text'>('en'), log: (): void => undefined });
    await job.refreshNow(tabId('w1:t1'), [lane]);
    assert.equal(firstTask(storeRead(store.records.readRecap(tabId('w1:t1'))) ?? blankRecap(tabId('w1:t1'))).sections?.goal, 'written late');
});

test('a run logs how long it took and why it ran, written or failed', async () => {
    for (const [reply, want] of [[{ kind: 'written', text: textOf(answer({ ...add('goal', 'x'), anchor: 'go' })), costUsd: brand<number, 'Usd'>(0) }, 'recap w1:t1: written in 12.4 s (turn-ended)'], [{ kind: 'unknown', why: { why: 'unreadable', detail: causeOf('x') } }, 'recap w1:t1: failed in 12.4 s (turn-ended)']] as const) {
        const summarizer: Writer = { backend: textOf('fake'), contract: 'strict', write: (): Promise<Written> => Promise.resolve(reply) };
        const [store, lines] = [memoryStore(), [] as string[]];
        let ticks = -1;
        const clock = { now: (): ReturnType<typeof instant> => { ticks += 1; return instant(1_000 + (ticks < 2 ? 0 : 12_400)); } };
        const reader: SessionReader = { ...quiet, read: (): Promise<ChunkResult> => Promise.resolve({ kind: 'chunk', entries: [{ role: 'user', text: textOf('go') }], title: null, lastPrompt: null, harnessRecap: null, notes: [], position: { cursor: cursorOf(5), tail: null }, grew: grewOf(true) }) };
        const job = new RecapJob({ writerView: (): { readonly kind: 'full' } => ({ kind: 'full' }), mint: mintFactId, repos: NO_REPOS, transcripts: registryWith({ [reader.agent]: reader }), records: checkedRecords(store.records), ledger: checkedLedger(store.ledger), clock, summarizer: (): Writer => summarizer, language: (): Text => brand<string, 'Text'>('en'), log: (line): void => { lines.push(line); } });
        job.request(tabId('w1:t1'), [laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's1' }))], 'turn-ended');
        await new Promise((resolve) => { setTimeout(resolve, 2700); });
        assert.ok(lines.includes(want), `${want} in ${JSON.stringify(lines)}`);
    }
});

test('the rewrite line stays while an open fact is still in the old language, and goes once none is', async () => {
    const calls: RecapRequest[] = [];
    const answers = [answer(), answer({ op: 'update', id: 'f1', text: 'migrar la base de datos' }), answer()];
    const summarizer: Writer = {
        backend: textOf('fake'),
        contract: 'strict',
        write: (request: RecapRequest): Promise<Written> => { calls.push(request); return Promise.resolve({ kind: 'written', text: textOf(answers[calls.length - 1] ?? answer()), costUsd: brand<number, 'Usd'>(0) }); },
    };
    const store = memoryStore();
    const lane = laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's1' }));
    seed(store, {
        ...blankRecap(tabId('w1:t1')), tasks: oneTask('## Goal\n- migrate', { goal: textOf('migrate'), now: [], needs: [], done: [], decisions: [], next: [], links: [], rules: [] }), at: instant(1), language: textOf('en'),
        sessions: [{ key: paneId('w1:p1'), agent: agentKind('claude'), transcript: sourcePathOf('/t/w1:p1'), cursor: cursorOf(100), tail: null, title: null, lastPrompt: null, harnessRecap: null }],
    });
    const job = new RecapJob({ writerView: (): { readonly kind: 'full' } => ({ kind: 'full' }), mint: mintFactId, repos: NO_REPOS,
        transcripts: registryWith({ claude: transcriptsOf('claude') }), records: checkedRecords(store.records), ledger: checkedLedger(store.ledger), clock: { now: (): ReturnType<typeof instant> => instant(9) }, summarizer: (): Writer => summarizer,
        language: (): Text => brand<string, 'Text'>('es'), log: (): void => undefined,
    });
    const once = async (): Promise<void> => {
        job.request(tabId('w1:t1'), [lane], 'requested');
        await new Promise((resolve) => { setTimeout(resolve, 20); });
    };
    await once();
    await once();
    await once();
    assert.deepEqual(calls.map((request) => [request.language, request.previousLanguage]), [['es', 'en'], ['es', 'en'], ['es', 'es']], 'the switch run, then a run that left f1 in English, then a run after f1 was rewritten');
    assert.equal(storeRead(store.records.readRecap(tabId('w1:t1')))?.language, 'es');
});

test('the writer request names the shown open facts that are not in the tab language, in ledger order, and none once they are rewritten', async () => {
    const calls: RecapRequest[] = [];
    const answers = [answer(), answer({ op: 'update', id: 'f1', text: 'migrar la base de datos' }), answer()];
    const summarizer: Writer = {
        backend: textOf('fake'),
        contract: 'strict',
        write: (request: RecapRequest): Promise<Written> => { calls.push(request); return Promise.resolve({ kind: 'written', text: textOf(answers[calls.length - 1] ?? answer()), costUsd: brand<number, 'Usd'>(0) }); },
    };
    const store = memoryStore();
    const lane = laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's1' }));
    seed(store, {
        ...blankRecap(tabId('w1:t1')), tasks: oneTask('## Goal\n- migrate', { goal: textOf('migrate'), now: [], needs: [], done: [], decisions: [], next: [], links: [], rules: [] }), at: instant(1), language: textOf('en'),
        sessions: [{ key: paneId('w1:p1'), agent: agentKind('claude'), transcript: sourcePathOf('/t/w1:p1'), cursor: cursorOf(100), tail: null, title: null, lastPrompt: null, harnessRecap: null }],
    });
    const job = new RecapJob({ writerView: (): { readonly kind: 'full' } => ({ kind: 'full' }), mint: mintFactId, repos: NO_REPOS,
        transcripts: registryWith({ claude: transcriptsOf('claude') }), records: checkedRecords(store.records), ledger: checkedLedger(store.ledger), clock: { now: (): ReturnType<typeof instant> => instant(9) }, summarizer: (): Writer => summarizer,
        language: (): Text => brand<string, 'Text'>('es'), log: (): void => undefined,
    });
    const once = async (): Promise<void> => {
        job.request(tabId('w1:t1'), [lane], 'requested');
        await new Promise((resolve) => { setTimeout(resolve, 20); });
    };
    await once();
    await once();
    await once();
    assert.deepEqual(calls.map((request) => request.notInLanguage?.map((fact) => fact.id)), [['f1'], ['f1'], undefined], 'the switch run, a run that left f1 in English, then a run after f1 was rewritten');
    assert.equal(Object.hasOwn(calls[2] ?? {}, 'notInLanguage'), false, 'with every fact in the tab language the request carries no list');
});

test('a recap already stamped in the wanted language but holding an open fact in the old one is rewritten on request, and a quiet focus does not call the writer', async () => {
    const calls: RecapRequest[] = [];
    const summarizer: Writer = {
        backend: textOf('fake'),
        contract: 'strict',
        write: (request: RecapRequest): Promise<Written> => { calls.push(request); return Promise.resolve({ kind: 'written', text: textOf(answer()), costUsd: brand<number, 'Usd'>(0) }); },
    };
    const store = memoryStore();
    const lane = laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's1' }));
    seed(store, {
        ...blankRecap(tabId('w1:t1')), tasks: oneTask('## Goal\n- migrate', { goal: textOf('migrate'), now: [], needs: [], done: [], decisions: [], next: [], links: [], rules: [] }), at: instant(1), language: textOf('en'),
        sessions: [{ key: paneId('w1:p1'), agent: agentKind('claude'), transcript: sourcePathOf('/t/w1:p1'), cursor: cursorOf(100), tail: null, title: null, lastPrompt: null, harnessRecap: null }],
    });
    const jobWith = (transcripts: SessionReader): RecapJob => new RecapJob({
        writerView: (): { readonly kind: 'full' } => ({ kind: 'full' }), mint: mintFactId, repos: NO_REPOS,
        transcripts: registryWith({ claude: transcripts }), records: checkedRecords(store.records), ledger: checkedLedger(store.ledger), clock: { now: (): ReturnType<typeof instant> => instant(9) }, summarizer: (): Writer => summarizer,
        language: (): Text => brand<string, 'Text'>('es'), log: (): void => undefined,
    });
    const once = async (job: RecapJob, cause: 'requested' | 'focused'): Promise<void> => {
        job.request(tabId('w1:t1'), [lane], cause);
        await new Promise((resolve) => { setTimeout(resolve, 20); });
    };
    await once(jobWith(transcriptsOf('claude')), 'requested');
    assert.equal(storeRead(store.records.readRecap(tabId('w1:t1')))?.language, 'es');
    assert.deepEqual(storeRead(store.ledger.keysOf(tabId('w1:t1'))).flatMap((key) => storeRead(store.ledger.openOf({ scope: tabIdOf('w1:t1'), key })).map((fact) => fact.language)), ['en']);
    calls.length = 0;
    await once(jobWith(quiet), 'requested');
    await once(jobWith(quiet), 'focused');
    assert.deepEqual(calls.map((request) => [request.language, request.previousLanguage]), [['es', 'en']], 'the requested run rewrites; the quiet focus that follows does not call the writer again');
});

test('the close-evidence setting reaches the writer request and the piped run; unset is off', async () => {
    for (const setting of [undefined, 'off', 'on'] as const) {
        const requests: RecapRequest[] = [];
        const summarizer: Writer = {
            backend: textOf('fake'),
            contract: 'strict',
            write: (request: RecapRequest): Promise<Written> => { requests.push(request); return Promise.resolve({ kind: 'written', text: textOf(answer({ op: 'close', id: 'f1', why: 'done' })), costUsd: brand<number, 'Usd'>(0) }); },
        };
        const store = memoryStore();
        seed(store, {
            ...blankRecap(tabId('w1:t1')), tasks: oneTask('## Goal\n- migrate', { goal: textOf('migrate'), now: [], needs: [], done: [], decisions: [], next: [], links: [], rules: [] }), at: instant(1), language: textOf('en'),
            sessions: [{ key: paneId('w1:p1'), agent: agentKind('claude'), transcript: sourcePathOf('/t/w1:p1'), cursor: cursorOf(100), tail: null, title: null, lastPrompt: null, harnessRecap: null }],
        });
        const deps = { writerView: (): { readonly kind: 'full' } => ({ kind: 'full' }), mint: mintFactId, repos: NO_REPOS,
            transcripts: registryWith({ claude: transcriptsOf('claude') }),
            records: checkedRecords(store.records), ledger: checkedLedger(store.ledger), clock: { now: (): ReturnType<typeof instant> => instant(5) }, summarizer: (): Writer => summarizer, language: (): Text => brand<string, 'Text'>('en'), log: (): void => undefined,
        };
        const job = new RecapJob(setting === undefined ? deps : { ...deps, closeEvidence: (): CloseEvidence => setting });
        job.request(tabId('w1:t1'), [laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 's1' }))], 'requested');
        await new Promise((resolve) => { setTimeout(resolve, 20); });
        const expected: CloseEvidence = setting ?? 'off';
        assert.equal(requests[0]?.closeEvidence, expected, String(setting));
        assert.equal(storeRead(store.ledger.openOf({ scope: tabIdOf('w1:t1'), key: textOf('t1') })).length, setting === 'on' ? 1 : 0, `open after ${String(setting)}`);
    }
});
