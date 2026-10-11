import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderHandoff } from '#src/recap/application/handoff-pipeline.ts';
import { exitCodeOf, messageKeyOf } from '#src/recap/domain/handoff-outcome.ts';
import type { WorksiteReader } from '#src/ports/worksite-reader.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { fact } from './fakes/fact-at.ts';
import { ID, NOW, OTHER_ID, depsOf, inputOf, textOf } from './fakes/handoff-pipeline-world.ts';

const HEADINGS = ['Freshness', 'Goal', 'Now', 'Needs', 'Done', 'Decisions', 'Next', 'Links', 'Rules', 'Recently closed', 'Worksite'];

test('a handoff renders the preamble, the reference line, the freshness, the ledger in section order and the worksite', async () => {
    const result = await renderHandoff(depsOf())(inputOf());
    const text = await textOf(result);
    assert.ok(text.startsWith('I am handing you work another agent was doing.'));
    assert.match(text, /^Handoff reference: 2026-10-11 10:00Z-456789ab$/m);
    assert.deepEqual([...text.matchAll(/^## (.+)$/gm)].map((match) => match[1]), HEADINGS);
    assert.match(text, /^last run: 2026-10-11 09:59Z, after a turn$/m);
    assert.match(text, /^lane status: idle$/m);
    assert.match(text, /^newer prompts: at least 2$/m);
    assert.match(text, /^refresh not requested$/m);
    assert.match(text, /^  - reason: it already handles the edge cases$/m);
    assert.match(text, /^- directory: \/repo$/m);
    assert.match(text, /^- last commit: abc1234 Add parser$/m);
    assert.match(text, /^  - src\/a\.ts$/m);
    assert.equal(result.kind === 'text' && result.omitted, 0);
    assert.equal(result.kind === 'text' && result.withheld, 0);
});

test('the same ledger under two handoff ids differs within the first 400 code points', async () => {
    const first = Array.from(await textOf(await renderHandoff(depsOf())(inputOf({ handoff: ID })))).slice(0, 400).join('');
    const second = Array.from(await textOf(await renderHandoff(depsOf())(inputOf({ handoff: OTHER_ID })))).slice(0, 400).join('');
    assert.notEqual(first, second);
});

test('a lane with no recap run is refused ledger-empty before git is asked anything', async () => {
    const asked: string[] = [];
    const reader: WorksiteReader = {
        lastCommit: async (directory) => { asked.push(directory); return unknown({ why: 'not-found', what: 'directory' }); },
        uncommitted: async (directory) => { asked.push(directory); return unknown({ why: 'not-found', what: 'directory' }); },
    };
    const result = await renderHandoff(depsOf({ lastRun: null, reader }))(inputOf());
    assert.deepEqual(result, { kind: 'refused', reason: 'ledger-empty' });
    assert.deepEqual([exitCodeOf({ kind: 'refused', reason: 'ledger-empty' }), messageKeyOf({ kind: 'refused', reason: 'ledger-empty' })], [1, 'refused.ledgerEmpty']);
    assert.deepEqual(asked, []);
});

test('a ledger whose every fact is withheld by the vetting is refused content-empty', async () => {
    const forbidden = [fact('f1', 'goal', 'Fix the herdr plugin', NOW - 1_000), fact('f2', 'now', 'Recap the tabs', NOW - 900)];
    const result = await renderHandoff(depsOf())(inputOf({ facts: forbidden }));
    assert.deepEqual(result, { kind: 'refused', reason: 'content-empty' });
    assert.equal(messageKeyOf({ kind: 'refused', reason: 'content-empty' }), 'refused.contentEmpty');
});

test('a never-cut part larger than the budget is refused too-large', async () => {
    const result = await renderHandoff(depsOf())(inputOf({ facts: [fact('g1', 'goal', 'x'.repeat(17_000), NOW - 1_000)] }));
    assert.deepEqual(result, { kind: 'refused', reason: 'too-large' });
    assert.deepEqual([exitCodeOf({ kind: 'refused', reason: 'too-large' }), messageKeyOf({ kind: 'refused', reason: 'too-large' })], [1, 'refused.tooLarge']);
});

test('a text reports its byte count and its omitted and withheld counts', async () => {
    const result = await renderHandoff(depsOf())(inputOf());
    assert.ok(result.kind === 'text');
    assert.equal(result.bytes, new TextEncoder().encode(result.text).byteLength);
    assert.deepEqual([result.omitted, result.withheld], [0, 0]);
});
