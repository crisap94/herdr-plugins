import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Entry } from '#src/ports/transcripts.ts';
import type { RecapRequest, Summarizer, Written } from '#src/ports/summarizer.ts';
import { extractPiped } from '#src/recap/application/extract-pipeline.ts';
import type { Extracted, Ground } from '#src/recap/application/extract-job.ts';
import { numbered } from '#src/recap/application/ledger-input.ts';
import { LEDGER_GATES } from '#src/recap/domain/gates/ledger-gates.ts';
import { writerContext } from '#src/recap/application/writer-context.ts';
import { foldedOf } from '#src/recap/domain/gates/words.ts';
import { gatesOf, PIPELINES, retriesTargeted } from '#src/recap/domain/pipeline.ts';
import type { Pipeline } from '#src/recap/domain/pipeline.ts';
import { answer, scripted } from '#test/fakes/enumerator.ts';
import type { Reply } from '#test/fakes/enumerator.ts';
import { factOf } from '#test/fakes/facts.ts';
import { longTurn, START } from '#test/fakes/long-turn.ts';
import { requestOf } from '#test/support.ts';

const NOW = START + 3_600_000;
const open = factOf('next', 'Review the migration test');
const numbering = numbered([{ key: 't1', open: [open], closed: [] }], [], false);
const ground: Ground = {
    gates: LEDGER_GATES, now: NOW, facts: new Map(numbering.ledgers.flatMap((ledger) => ledger.facts.map((each) => [each.id, each] as const))),
    resolving: { tasks: ['t1'], agents: [], taskOf: numbering.taskOf, turns: [], clock: { now: NOW, zone: 'UTC' } },
    grounds: [{ key: 't1', tab: 'w1:t1', shown: numbering.shown.get('t1') ?? new Map(), closedLately: [], source: foldedOf('Add retries to the uploader Added a retry with backoff in src/upload.ts. git commit -m "uploader: retry"'), language: 'en', agents: [] }],
};
const SMALL: readonly Entry[] = [
    { role: 'user', text: 'Add retries to the uploader', at: START },
    { role: 'agent', text: 'Added a retry with backoff in src/upload.ts.', at: START + 60_000 },
    { role: 'tool', kind: 'shell', text: 'git commit -m "uploader: retry"', at: START + 120_000 },
];
const request = (entries: readonly Entry[]): RecapRequest => requestOf({ entries, ledgers: [{ task: null, facts: numbering.ledgers[0]?.facts ?? [] }] });
const OPS = JSON.stringify({ ops: [{ op: 'add', section: 'done', text: 'Added retry with backoff', anchor: 'Added a retry with backoff in src/upload.ts' }] });

function writer(): { summarizer: Summarizer; seen: RecapRequest[] } {
    const seen: RecapRequest[] = [];
    return { seen, summarizer: { backend: 'fake', write: (asked): Promise<Written> => { seen.push(asked); return Promise.resolve({ kind: 'written', text: OPS, costUsd: 0.5 }); } } };
}

interface Ran {
    readonly done: Extracted;
    readonly seen: RecapRequest[];
    readonly documents: string[];
    readonly logs: string[];
}

async function run(pipeline: Pipeline, entries: readonly Entry[], replies: readonly Reply[] | null): Promise<Ran> {
    const { summarizer, seen } = writer();
    const enumerating = replies === null ? null : scripted(replies);
    const logs: string[] = [];
    const done = await extractPiped(summarizer, request(entries), ground, { pipeline, enumerator: enumerating?.enumerator ?? null, log: (line) => { logs.push(line); } });
    return { done, seen, documents: enumerating?.documents ?? [], logs };
}

const cost = (done: Extracted): number => done.cost;
const asks = (document: string): string => (document.includes('<questions>')
    ? answer([{ section: 'rules', text: 'Never push to main', anchor: 'Move the importer to async streams' }])
    : answer([{ section: 'done', text: 'Moved the importer to async streams', anchor: 'Move the importer to async streams' }]));
const talk = answer([{ section: 'done', text: 'Added retry with backoff to the uploader', anchor: 'Added a retry with backoff in src/upload.ts' }, { section: 'next', text: 'Tag the uploader release', anchor: 'git commit -m "uploader: retry"' }]);

test('one: the single call of 2.0; the enumeration is never asked and the writer sees no candidates', async () => {
    const { done, seen, documents } = await run('one', SMALL, [talk]);
    assert.deepEqual([seen.length, documents.length, seen[0]?.input.candidates, cost(done)], [1, 0, undefined, 0.5]);
});

test('enumerate and enumerate+gates: one enumeration call, then the writer\'s call with the candidates; the cost is the sum', async () => {
    for (const pipeline of ['enumerate', 'enumerate+gates'] as const) {
        const { done, seen, documents } = await run(pipeline, SMALL, [talk]);
        assert.equal(documents.length, 1);
        assert.equal(seen.length, 1);
        const candidates = seen.at(0)?.input.candidates?.map((one) => [one.section, one.flagged]);
        assert.deepEqual(candidates, [['done', false], ['next', false]], pipeline);
        assert.equal(seen.at(0)?.input.transcripts.at(0)?.entries.length, 3);
        assert.ok(done.kind === 'ops' && done.cost === 0.51 && done.tasks[0]?.ops.length === 1, pipeline);
    }
});

test('no enumerator (none installed, or a custom writer), or no new turns: the single call', async () => {
    const without = await run('full', SMALL, null);
    assert.deepEqual([without.seen.length, without.seen[0]?.input.candidates], [1, undefined]);
    const quiet = await run('full', [], [talk]);
    assert.deepEqual([quiet.seen.length, quiet.documents.length], [1, 0], 'nothing new: nothing to enumerate');
});

test('an enumeration that fails does not lose the turn: the single call runs, and the enumeration\'s cost is kept', async () => {
    const { done, seen, logs } = await run('full', SMALL, ['sorry, no']);
    assert.deepEqual([seen.length, seen[0]?.input.candidates, done.kind, cost(done)], [1, undefined, 'ops', 0.51]);
    assert.match(logs.join('\n'), /enumeration failed, the run takes the single call/);
});

test('full: a long turn takes ONE ask-back restricted to the questions the candidates leave open, never a third call, then the writer', async () => {
    const rows = longTurn();
    const { done, seen, documents } = await run('full', rows, [asks]);
    const asked = documents.filter((document) => document.includes('<questions>'));
    assert.equal(asked.length, 1, 'one ask-back');
    assert.equal(documents.at(-1), asked[0], 'after the chunks');
    assert.ok(asked[0]?.includes('What must not be done?') && asked[0].includes('What is the goal?'), 'the open read-back questions, in the document');
    assert.equal(seen.length, 1);
    assert.ok(seen[0]?.input.candidates?.some((one) => one.section === 'rules'), 'the answer of the ask-back reaches the writer');
    assert.ok(done.kind === 'ops');
});

test('enumerate on the same long turn takes no ask-back; full on a short, rich turn takes none either', async () => {
    const enumerating = await run('enumerate', longTurn(), [answer([])]);
    assert.equal(enumerating.documents.some((document) => document.includes('<questions>')), false);
    const rich = await run('full', SMALL, [answer([{ section: 'goal', text: 'Add retries', anchor: 'Add retries to the uploader' }, { section: 'done', text: 'Added retry with backoff', anchor: 'Added a retry with backoff' }, { section: 'next', text: 'Tag it', anchor: 'git commit' }, { section: 'rules', text: 'Never push to main', anchor: 'Add retries to the uploader' }, { section: 'needs', text: 'Which branch', anchor: 'Add retries' }, { section: 'decisions', text: 'Backoff because gentler', why: 'gentler', anchor: 'retry with backoff' }])]);
    assert.equal(rich.documents.length, 1, 'six candidates for a short turn: nothing left to ask');
});

test('the writer\'s targeted retry is the short document: no transcript and no candidates, only the refused operation; the cost is the sum', async () => {
    const calls: RecapRequest[] = [];
    const bad = JSON.stringify({ ops: [{ op: 'close', id: 'f99', why: 'done' }] });
    const summarizer: Summarizer = { backend: 'fake', write: (asked): Promise<Written> => { calls.push(asked); return Promise.resolve({ kind: 'written', text: calls.length === 1 ? bad : OPS, costUsd: 0.5 }); } };
    const { enumerator } = scripted([talk]);
    const done = await extractPiped(summarizer, request(SMALL), ground, { pipeline: 'enumerate+gates', enumerator, log: () => undefined });
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.input.candidates?.length, 2, 'the first call reconciles the candidates');
    const retry = calls[1];
    assert.ok(retry?.retry !== undefined && !writerContext(retry).includes('<candidates') && !writerContext(retry).includes('<transcript'));
    assert.equal(cost(done), 1.01);
});

const ids = (pipeline: Pipeline): readonly string[] => gatesOf(pipeline).map((gate) => gate.id);

test('the gate set and the retry of each pipeline: one, enumerate+gates and full judge with every 2.1 gate and retry only what was refused; enumerate keeps the 2.0 set and the whole-document retry', () => {
    const every = LEDGER_GATES.map((gate) => gate.id);
    assert.ok(every.includes('G11') && every.includes('G12'));
    assert.deepEqual(Object.fromEntries(PIPELINES.map((pipeline) => [pipeline, ids(pipeline)])), {
        one: every, enumerate: every.filter((id) => id !== 'G11' && id !== 'G12'), 'enumerate+gates': every, full: every,
    });
    assert.deepEqual(PIPELINES.map(retriesTargeted), [true, false, true, true]);
});

test('enumerate adds a fact with no anchor (the 2.0 gates); enumerate+gates refuses it and sends back only that operation', async () => {
    const noAnchor = JSON.stringify({ ops: [{ op: 'add', section: 'done', text: 'Added retry with backoff' }] });
    for (const pipeline of ['enumerate', 'enumerate+gates'] as const) {
        const calls: RecapRequest[] = [];
        const summarizer: Summarizer = { backend: 'fake', write: (asked): Promise<Written> => { calls.push(asked); return Promise.resolve({ kind: 'written', text: calls.length === 1 ? noAnchor : OPS, costUsd: 0.5 }); } };
        const done = await extractPiped(summarizer, request(SMALL), ground, { pipeline, enumerator: scripted([talk]).enumerator, log: () => undefined });
        assert.ok(done.kind === 'ops' && done.tasks[0]?.ops.length === 1, pipeline);
        assert.equal(calls.length, pipeline === 'enumerate' ? 1 : 2, pipeline);
        if (pipeline === 'enumerate+gates') {
            assert.ok(calls[1]?.retry !== undefined && calls[1].correction === undefined);
        }
    }
});

test('enumerate retries with the whole document and a line per refusal, as 2.0 did', async () => {
    const calls: RecapRequest[] = [];
    const bad = JSON.stringify({ ops: [{ op: 'close', id: 'f99', why: 'done' }] });
    const summarizer: Summarizer = { backend: 'fake', write: (asked): Promise<Written> => { calls.push(asked); return Promise.resolve({ kind: 'written', text: calls.length === 1 ? bad : OPS, costUsd: 0.5 }); } };
    await extractPiped(summarizer, request(SMALL), ground, { pipeline: 'enumerate', enumerator: scripted([talk]).enumerator, log: () => undefined });
    assert.equal(calls.length, 2);
    assert.match(calls[1]?.correction ?? '', /G6/);
    assert.equal(calls[1]?.retry, undefined);
    assert.ok(calls[1]?.input.candidates?.length === 2, 'the whole document, candidates included');
});
