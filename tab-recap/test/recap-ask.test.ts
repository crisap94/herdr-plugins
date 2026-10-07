// The writer's answer through the gates: refused items go back once, what is still refused is dropped, the rest is kept, the counts are reported.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ask } from '#src/recap/application/recap-ask.ts';
import { blankRecap } from '#src/ports/recap-records.ts';
import type { RecapRequest, Summarizer, Written } from '#src/ports/summarizer.ts';
import { requestOf } from '#test/support.ts';

const answer = (sections: object): string => JSON.stringify({ goal: 'Ship retries for the upload client.', ...sections });
const NARRATOR = 'claude completed the research and wrote its report.';
const FINE = 'The research report is written to docs/report.md.';

/** A writer that gives these answers in turn (the last one again after that) and remembers what it was asked. */
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

const run = (summarizer: Summarizer, language: 'en' | 'es' = 'en'): ReturnType<typeof ask> =>
    ask(summarizer, requestOf({ language, entries: [{ role: 'user', text: 'go' }] }), blankRecap('w1:t1'), ['w1:p1'], language);

test('a refused item comes back as a correction that quotes it with the gate\'s reason; a rewrite passes and the counts remember the refusal', async () => {
    const { summarizer, asked } = writer(answer({ done: [NARRATOR, 'Both pipelines for !256 are green.'] }), answer({ done: [FINE, 'Both pipelines for !256 are green.'] }));
    const asking = await run(summarizer);
    assert.ok(asking.kind === 'tasks');
    assert.equal(asked.length, 2);
    assert.match(asked[1]?.correction ?? '', /G1 done: "claude completed the research and wrote its report\." — the subject is an agent/);
    assert.equal(asking.stats.refused['G1'], 1);
    assert.equal(asking.stats.dropped, 0);
    assert.deepEqual(asking.tasks[0]?.sections?.done, [FINE, 'Both pipelines for !256 are green.']);
    assert.equal(asking.cost, 0.02);
});

test('a writer that repeats a refused item loses only that item: it is dropped, the rest is kept, and the Markdown is drawn without it', async () => {
    const { summarizer, asked } = writer(answer({ done: [NARRATOR, FINE], now: ['Review !256.'] }));
    const asking = await run(summarizer);
    assert.equal(asked.length, 2, 'one retry, no more');
    assert.ok(asking.kind === 'tasks');
    const markdown = asking.tasks.at(0)?.markdown ?? '';
    assert.deepEqual(asking.tasks.at(0)?.sections?.done, [FINE]);
    assert.deepEqual(asking.tasks.at(0)?.sections?.now, ['Review !256.']);
    assert.doesNotMatch(markdown, /claude completed/);
    assert.match(markdown, /docs\/report\.md/);
    assert.deepEqual([asking.stats.refused, asking.stats.dropped], [{ G1: 2 }, 1]);
});

test('two refused items are both listed in the correction', async () => {
    const { summarizer, asked } = writer(answer({ done: [NARRATOR], decisions: ['Leave the unrelated db tab alone.'] }), answer({ done: [FINE] }));
    await run(summarizer);
    const correction = asked[1]?.correction ?? '';
    assert.match(correction, /G1 done: "claude completed/);
    assert.match(correction, /G3 decisions: "Leave the unrelated db tab alone\." — a decision needs its reason/);
});

test('a duplicate names the item kept; a refused link and a wrong-language item are refused too', async () => {
    const first = answer({ done: ['Both pipelines for !256 are green.', 'Both pipelines for !256 are green, as checked.'], links: ['the thing from before'], next: ['Las pruebas fallan después de la fusión.'] });
    const { summarizer, asked } = writer(first, answer({ done: ['Both pipelines for !256 are green.'] }));
    await run(summarizer);
    const correction = asked[1]?.correction ?? '';
    assert.match(correction, /G2 done: "Both pipelines for !256 are green, as checked\." — it repeats another item of this task: "Both pipelines for !256 are green\."/);
    assert.match(correction, /G4 links: "the thing from before"/);
    assert.match(correction, /G5 next: "Las pruebas/);
});

test('the reasons are written in the recap\'s language', async () => {
    const { summarizer, asked } = writer(JSON.stringify({ goal: 'Publicar la versión', decisions: ['Dejar la pestaña de la base de datos.'] }), JSON.stringify({ goal: 'Publicar la versión' }));
    await run(summarizer, 'es');
    assert.match(asked[1]?.correction ?? '', /una decisión necesita su razón/);
});

test('items that name nothing concrete or open with a pronoun are kept and counted as flagged, never sent back', async () => {
    const { summarizer, asked } = writer(answer({ next: ['Improve the settings.', 'It still fails on the second run.', 'Run `bash ci/test.sh` on feat/retry.'] }));
    const asking = await run(summarizer);
    assert.equal(asked.length, 1, 'nothing refused: no retry');
    assert.ok(asking.kind === 'tasks');
    assert.equal(asking.tasks[0]?.sections?.next.length, 3);
    assert.deepEqual([asking.stats.refused, asking.stats.flagged, asking.stats.dropped], [{}, { G8: 2, G9: 1 }, 0]);
});

test('when the retry cannot be used the first answer is kept without its refused items; with no usable first answer the run fails as before', async () => {
    const kept = await run(writer(answer({ done: [NARRATOR, FINE] }), 'not json at all').summarizer);
    assert.ok(kept.kind === 'tasks');
    assert.deepEqual([kept.tasks[0]?.sections?.done, kept.stats.refused, kept.stats.dropped], [[FINE], { G1: 1 }, 1]);
    const failed = await run(writer('nope', 'still nope').summarizer);
    assert.equal(failed.kind, 'failed');
});

test('an agent label of the tab is a narrator too', async () => {
    const request = requestOf({ entries: [{ role: 'user', text: 'go' }], agents: [{ id: 'a1', kind: 'claude', label: 'orchestrator', pane: 'w1:p1', source: 'transcript', cwd: null, repo: null, branch: null, files: [] }] });
    const { summarizer, asked } = writer(answer({ done: ['orchestrator merged !256.'] }), answer({ done: ['!256 is merged.'] }));
    await ask(summarizer, request, blankRecap('w1:t1'), ['w1:p1'], 'en');
    assert.match(asked[1]?.correction ?? '', /G1 done: "orchestrator merged !256\."/);
});
