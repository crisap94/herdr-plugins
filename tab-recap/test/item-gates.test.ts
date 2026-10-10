import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extract } from '#src/recap/application/extract-job.ts';
import type { Extracted, Ground } from '#src/recap/application/extract-job.ts';
import type { RecapRequest, Summarizer, Written } from '#src/ports/summarizer.ts';
import { writerContext } from '#src/recap/application/writer-context.ts';
import { LEDGER_GATES } from '#src/recap/domain/gates/ledger-gates.ts';
import { itemGate } from '#src/recap/domain/gates/item-gates.ts';
import type { Operation } from '#src/recap/domain/ops.ts';
import { factOf } from './fakes/facts.ts';
import { requestOf } from './support.ts';

const NARRATOR = 'claude completed the research and wrote its report.';
const FINE = 'The research report is written to docs/report.md.';
const add = (section: string, text: string, why?: string): Record<string, unknown> => ({ op: 'add', section, text, anchor: 'go', ...(why === undefined ? {} : { why }) });
const ops = (...list: readonly Record<string, unknown>[]): string => JSON.stringify({ ops: list });

const groundOf = (over: { readonly language?: string; readonly agents?: readonly string[] } = {}): Ground => ({
    gates: LEDGER_GATES, now: 1, facts: new Map(),
    resolving: { tasks: ['t1'], agents: [], taskOf: new Map(), turns: [], clock: { now: 1, zone: 'UTC' } },
    grounds: [{ key: 't1', tab: 'w1:t1', shown: new Map(), closedLately: [], source: 'go', language: over.language ?? 'en', agents: over.agents ?? ['claude', 'a1'] }],
});

function writer(...texts: readonly string[]): { summarizer: Summarizer; asked: RecapRequest[] } {
    const asked: RecapRequest[] = [];
    const summarizer: Summarizer = {
        backend: 'fake',
        write: (request): Promise<Written> => {
            asked.push(request);
            return Promise.resolve({ kind: 'written', text: texts[Math.min(asked.length, texts.length) - 1] ?? '', costUsd: 0.01 });
        },
    };
    return { summarizer, asked };
}

const retryDoc = (request: RecapRequest | undefined): string => (request === undefined ? '' : writerContext(request));

const run = (summarizer: Summarizer, ground = groundOf()): Promise<Extracted> => extract(summarizer, requestOf({ entries: [{ role: 'user', text: 'go' }] }), ground);
const texts = (done: Extracted): readonly string[] => (done.kind === 'ops' ? done.tasks.flatMap((task) => task.ops.flatMap((op) => (op.op === 'add' ? op.text : []))) : []);

test('the adapter: an add or update becomes the item it would put in the recap; a close puts nothing; a decision\'s why is its reason clause', () => {
    const shown = new Map([['f1', factOf('decisions', 'Keep SQLite', { why: 'one file to back up' })]]);
    const context = { now: 1, language: 'en', agents: ['claude'], shown, closedLately: [], source: 'go' };
    const found = (list: readonly Operation[]): readonly string[] => itemGate.check(list, context).map((finding) => `${finding.at}:${finding.gate}:${finding.outcome}`);
    assert.deepEqual(found([{ op: 'add', section: 'done', text: NARRATOR, why: null, ref: null, at: null, agent: null }]), ['0:G1:refuse']);
    assert.deepEqual(found([{ op: 'add', section: 'decisions', text: 'Leave the db tab alone.', why: null, ref: null, at: null, agent: null }]), ['0:G3:refuse']);
    assert.deepEqual(found([{ op: 'add', section: 'decisions', text: 'Leave the db tab alone.', why: 'it is not part of this task', ref: null, at: null, agent: null }]), ['0:G8:flag'], 'passes (flagged only: it names nothing concrete)');
    assert.deepEqual(found([{ op: 'update', id: 'f1', text: 'Keep SQLite for 2.0', why: null }]), [], 'an update keeps the fact\'s why');
    assert.deepEqual(found([{ op: 'update', id: 'f9', text: NARRATOR, why: null }, { op: 'close', id: 'f1', why: 'done' }]), [], 'an unknown id is G6\'s, a close has no text');
    assert.deepEqual(found([{ op: 'add', section: 'done', text: FINE, why: null, ref: null, at: null, agent: null }, { op: 'update', id: 'f1', text: NARRATOR, why: null }]), ['1:G1:refuse']);
});

test('a refused add comes back as a correction that quotes it with the gate\'s reason; a rewrite passes and the counts remember the refusal', async () => {
    const { summarizer, asked } = writer(ops(add('done', NARRATOR), add('done', 'Both pipelines for !256 are green.')), ops(add('done', FINE)));
    const done = await run(summarizer);
    assert.equal(asked.length, 2);
    assert.match(retryDoc(asked[1]), /<operation op="add" section="done" anchor="go">claude completed the research and wrote its report\.<\/operation>\s*<reason gate="G1">the subject is an agent/);
    assert.doesNotMatch(retryDoc(asked[1]), /Both pipelines for !256 are green/, 'what passed is not sent back');
    assert.deepEqual(texts(done), ['Both pipelines for !256 are green.', FINE], 'what passed stays; the replacement follows it');
    assert.ok(done.kind === 'ops' && done.stats.refused['G1'] === 1 && done.stats.dropped === 0 && done.cost === 0.02);
});

test('a writer that repeats a refused add loses only that one: it is dropped, the rest is kept', async () => {
    const { summarizer, asked } = writer(ops(add('done', NARRATOR), add('done', FINE), add('now', 'Review !256.')), ops(add('done', NARRATOR)));
    const done = await run(summarizer);
    assert.equal(asked.length, 2, 'one retry, no more');
    assert.deepEqual(texts(done), [FINE, 'Review !256.']);
    assert.ok(done.kind === 'ops' && done.stats.refused['G1'] === 2 && done.stats.dropped === 1);
});

test('two refused adds are both listed in the correction', async () => {
    const { summarizer, asked } = writer(ops(add('done', NARRATOR), add('decisions', 'Leave the unrelated db tab alone.')), ops(add('done', FINE)));
    await run(summarizer);
    assert.match(retryDoc(asked[1]), /<operation op="add" section="done" anchor="go">claude completed[^<]*<\/operation>\s*<reason gate="G1">/);
    assert.match(retryDoc(asked[1]), /<operation op="add" section="decisions" anchor="go">Leave the unrelated db tab alone\.<\/operation>\s*<reason gate="G3">(?:<!\[CDATA\[)?a decision needs its reason/);
});

test('a repeat inside the answer is the ledger gate\'s (G2) and is sent back; a link that does not resolve and a wrong-language add are flagged, kept and not sent back', async () => {
    const first = ops(add('done', 'Both pipelines for !256 are green.'), add('done', 'Both pipelines for !256 are green, as checked.'), add('links', 'the thing from before'), add('next', 'Las pruebas fallan después de la fusión.'));
    const { summarizer, asked } = writer(first, ops(add('done', 'Both pipelines for !256 are green, checked twice.')));
    const done = await run(summarizer);
    assert.deepEqual(texts(done).slice(0, 3), ['Both pipelines for !256 are green.', 'the thing from before', 'Las pruebas fallan después de la fusión.'], 'the dead link and the Spanish line are kept');
    assert.ok(done.kind === 'ops' && done.stats.flagged['G4'] === 1 && done.stats.flagged['G5'] === 1, 'and counted as flagged');
    const correction = retryDoc(asked[1]);
    assert.match(correction, /Both pipelines for !256 are green, as checked\.<\/operation>\s*<reason gate="G2">it repeats another fact added in this answer/);
    assert.doesNotMatch(correction, /G4/, 'a dead link is flagged and kept, never sent back');
    assert.doesNotMatch(correction, /G5|Las pruebas/, 'a wrong-language fact is flagged and kept, never sent back');
});

test('the reasons are written in the recap\'s language', async () => {
    const { summarizer, asked } = writer(ops(add('goal', 'Publicar la versión'), add('decisions', 'Dejar la pestaña de la base de datos.')), ops(add('goal', 'Publicar la versión')));
    await run(summarizer, groundOf({ language: 'es' }));
    assert.match(retryDoc(asked[1]), /una decisión necesita su razón/);
});

test('adds that name nothing concrete or open with a pronoun are kept and counted as flagged, never sent back', async () => {
    const { summarizer, asked } = writer(ops(add('next', 'Improve the settings.'), add('next', 'It still fails on the second run.'), add('next', 'Run `bash ci/test.sh` on feat/retry.')));
    const done = await run(summarizer);
    assert.equal(asked.length, 1, 'nothing refused: no retry');
    assert.equal(texts(done).length, 3);
    assert.ok(done.kind === 'ops' && done.stats.flagged['G8'] === 2 && done.stats.flagged['G9'] === 1 && Object.keys(done.stats.refused).length === 0);
});

test('when the retry cannot be used the first answer is kept without its refused adds; with no usable first answer the run fails', async () => {
    const kept = await run(writer(ops(add('done', NARRATOR), add('done', FINE)), 'not json at all').summarizer);
    assert.deepEqual(texts(kept), [FINE]);
    assert.ok(kept.kind === 'ops' && kept.stats.refused['G1'] === 1 && kept.stats.dropped === 1);
    assert.equal((await run(writer('nope', 'still nope').summarizer)).kind, 'failed');
});

test('an agent label of the tab is a narrator too', async () => {
    const { summarizer, asked } = writer(ops(add('done', 'orchestrator merged !256.')), ops(add('done', '!256 is merged.')));
    await run(summarizer, groundOf({ agents: ['orchestrator', 'a1', 'claude'] }));
    assert.match(retryDoc(asked[1]), /orchestrator merged !256\.<\/operation>\s*<reason gate="G1">/);
});
