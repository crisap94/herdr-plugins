import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hindsightOf, agentTextOf } from '#src/experiment/hindsight.ts';
import { boundaryOutcomes } from '#src/experiment/outcomes.ts';
import type { Boundary, BoundaryOutcome, TranscriptEvent } from '#src/experiment/outcomes.ts';
import { isReadingTool, parseToolInput, shellReadsOf, toolReads } from '#src/experiment/read-paths.ts';
import { drawsOf, shuffledBy } from '#src/experiment/seeded.ts';
import { stratifyMoments } from '#src/experiment/stratify.ts';
import type { Moment } from '#src/experiment/stratify.ts';
import { brand } from '@stateforge-labs/session-ledger';
import { parseFactIndex } from '#src/recap/domain/fact-index.ts';
import type { Label } from '#src/experiment/stats.ts';
import { onlyInRecent, verbatimLabel } from '#src/experiment/verbatim.ts';
import { must } from '@stateforge-labs/session-ledger';
import { parseText, type Text, textOf } from '@stateforge-labs/session-ledger';

const asText = (value: string): Text => must(parseText(value));
const count = brand<number, 'Count'>;
const seeded = (seed: number): ReturnType<typeof drawsOf> => drawsOf(count(seed));
const shellReads = (command: string): readonly string[] => shellReadsOf(asText(command));
const readsOf = (name: string, input: Record<string, unknown>): readonly string[] => (isReadingTool(name) ? toolReads(name, parseToolInput(input)) : []);

test('seeded: the same seed gives the same order', () => {
    assert.deepEqual(shuffledBy([1, 2, 3, 4, 5, 6], seeded(42)), shuffledBy([1, 2, 3, 4, 5, 6], seeded(42)));
    assert.notDeepEqual(shuffledBy([1, 2, 3, 4, 5, 6, 7, 8], seeded(1)), shuffledBy([1, 2, 3, 4, 5, 6, 7, 8], seeded(2)));
});

const candidates = (): Moment[] => Array.from({ length: 300 }, (_, i) => ({ id: asText(`p${i}`), share: count(i % 3 === 0 ? 55 : 10), beforeBoundary: i % 25 === 0 ? 'yes' : 'no' }));

test('stratify: quotas, no point twice, boundary points first, shortfalls recorded', () => {
    const { picked, counts } = stratifyMoments(candidates());
    assert.equal(new Set(picked.map((p) => p.id)).size, picked.length);
    assert.equal(counts.boundary.got, 12);
    assert.equal(counts.high.got, 100 - 4);
    assert.deepEqual(counts.high.asked, 120);
    assert.equal(counts.random.got, 60);
    assert.deepEqual(stratifyMoments(candidates()), stratifyMoments(candidates()));
    assert.ok(picked.filter((p) => p.stratum === 'boundary').every((p) => Number(p.id.slice(1)) % 25 === 0));
});

test('read paths: Read, cat, sed -n, head, tail; not other commands', () => {
    assert.deepEqual(readsOf('Read', { file_path: '/a/b.ts' }), ['/a/b.ts']);
    assert.deepEqual(shellReads("sed -n '1,40p' src/a.ts"), ['src/a.ts']);
    assert.deepEqual(shellReads('cat /x/y.md | head'), ['/x/y.md']);
    assert.deepEqual(shellReads('tail -n 20 logs/app.log && echo done'), ['logs/app.log']);
    assert.deepEqual(shellReads('grep foo src/a.ts'), []);
    assert.deepEqual(readsOf('Edit', { file_path: '/a/b.ts' }), []);
});

type Event = TranscriptEvent;
const tool = (...reads: string[]): Event => ({ kind: 'tool', reads: reads.map(asText) });
const prompt = (text: string): Event => ({ kind: 'prompt', text: asText(text) });
const boundary: Boundary = { kind: 'boundary', pos: count(10), at: instant(1), trigger: asText('auto'), pre: count(900), post: count(100) };
const outcomesOf = (events: readonly Event[]): readonly BoundaryOutcome[] => boundaryOutcomes(events);

test('outcomes: re-reads inside 50 before and 10 after, restated prompt by Jaccard', () => {
    const before: Event[] = [prompt('please fix the login bug in auth'), tool('/a.ts', '/b.ts'), tool('/c.ts')];
    const after: Event[] = [prompt('fix the login bug in auth please'), tool('/b.ts'), tool('/zzz.ts')];
    const outcome = outcomesOf([...before, boundary, ...after])[0] as BoundaryOutcome;
    assert.equal(outcome.reReads, 1);
    assert.equal(outcome.restated, 'yes');
    assert.equal(outcome.preTokens, 900);
});

test('outcomes: only the 10 calls after count, and a different prompt is not a restatement', () => {
    const after: Event[] = [...Array.from({ length: 10 }, () => tool('/n.ts')), tool('/a.ts'), prompt('completely different words entirely')];
    const outcome = outcomesOf([prompt('fix the login bug'), tool('/a.ts'), boundary, ...after])[0] as BoundaryOutcome;
    assert.equal(outcome.reReads, 0);
    assert.equal(outcome.restated, 'no');
});

test('hindsight: six entries or the character budget, and the next operator prompt', () => {
    const entries = Array.from({ length: 9 }, (_, i) => ({ role: i === 2 ? 'user' as const : 'agent' as const, text: textOf(`entry ${i} ${'x'.repeat(100)}`) }));
    const found = hindsightOf(entries);
    assert.equal(found.following.length, 6);
    assert.match(found.next_prompt ?? '', /^entry 2/);
    const clipped = hindsightOf([{ role: 'agent', text: textOf('y'.repeat(9000)) }]);
    assert.ok((clipped.following[0]?.text.length ?? 0) <= 8001);
    assert.ok(!agentTextOf(found).includes('entry 2'));
});

test('verbatim: a path, error line or hash only in the recent turns that the agent then uses', () => {
    const recent = asText('ran tests\nError: ENOENT no such file /srv/app/config.yaml\nfixed at 3f9a2bc1d');
    assert.equal(verbatimLabel(recent, asText('goal: ship the thing'), asText('now editing /srv/app/config.yaml')), 1);
    assert.equal(verbatimLabel(recent, asText('goal: ship the thing'), asText('moving on to a new topic')), 0);
    assert.equal(verbatimLabel(recent, asText('see /srv/app/config.yaml and 3f9a2bc1d and Error: ENOENT no such file /srv/app/config.yaml'), asText('now editing /srv/app/config.yaml')), 0);
    assert.ok(onlyInRecent(recent, asText('')).includes(asText('3f9a2bc1d')));
});

import { sectionsOf } from '#src/experiment/coverage.ts';
import { coverageLabelsIn, labelsIn } from '#src/experiment/label-prompt.ts';
import { pooledBy, retriedBy } from '#src/experiment/pool.ts';

const fact = (section: Section, text: string, state: 'open' | 'closed' = 'open', why: string | null = null): HistoryFact => ({ section, text: textOf(text), why: why === null ? null : textOf(why), state, closedWhy: null, closedAt: null, firstAt: instant(1), lastAt: instant(2) });

test('coverage: the recap sections the brief job is given, from the open facts', () => {
    const history = [fact('goal', 'g'), fact('done', 'd'), fact('now', 'n', 'closed'), fact('decisions', 'x', 'open', 'because'), fact('links', 'l'), fact('rules', 'r')];
    assert.equal(sectionsOf(history).goal, 'g');
    assert.deepEqual(sectionsOf(history).rules, ['r']);
    assert.deepEqual(sectionsOf(history).now, []);
    assert.deepEqual(sectionsOf(history).decisions, ['x']);
});

const labelsOf = (reply: string, ids: readonly string[]): Readonly<Record<string, Label>> | null => {
    const found = labelsIn(asText(reply), ids.map(asText));
    return found === null ? null : Object.fromEntries(found);
};

const coverageLabelsOf = (reply: string, facts: readonly { readonly n: number; readonly reason: boolean }[]): Readonly<Record<string, unknown>> | null => {
    const found = coverageLabelsIn(asText(reply), facts.map((item) => ({ n: must(parseFactIndex(item.n)), reason: item.reason ? 'yes' as const : 'no' as const })));
    return found === null ? null : Object.fromEntries(found);
};

test('labels: only 0 or 1 for every id; coverage labels need a reason for a decision', () => {
    assert.deepEqual(labelsOf('```json\n{"a":1,"b":0}\n```', ['a', 'b']), { a: 1, b: 0 });
    assert.equal(labelsOf('{"a":0.5,"b":0}', ['a', 'b']), null);
    assert.equal(labelsOf('{"a":1}', ['a', 'b']), null);
    assert.equal(labelsOf('nope', ['a']), null);
    assert.deepEqual(coverageLabelsOf('{"1":{"keeps":1},"2":{"keeps":0,"reason":1}}', [{ n: 1, reason: false }, { n: 2, reason: true }]), { 1: { keeps: 1 }, 2: { keeps: 0, reason: 1 } });
    assert.equal(coverageLabelsOf('{"2":{"keeps":0}}', [{ n: 2, reason: true }]), null);
});

test('pool: limit respected, order kept; retried: waits grow and the last answer returns', async () => {
    let live = 0;
    let peak = 0;
    const out = await pooledBy([1, 2, 3, 4, 5, 6], count(2), async (n) => { live += 1; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 5)); live -= 1; return n * 2; });
    assert.deepEqual(out, [2, 4, 6, 8, 10, 12]);
    assert.equal(peak, 2);
    const waits: number[] = [];
    let calls = 0;
    const last = await retriedBy(() => { calls += 1; return Promise.resolve(calls); }, (n) => (n >= 3 ? 'usable' : 'unusable'), { baseMs: brand<number, 'Milliseconds'>(10), sleep: (ms) => { waits.push(ms); return Promise.resolve(); } });
    assert.equal(last, 3);
    assert.deepEqual(waits, [10, 20]);
});

import type { HistoryFact } from '@stateforge-labs/session-ledger';
import { kappaScores } from '#src/experiment/kappa-report.ts';
import type { LabelledMoment } from '#src/experiment/kappa-report.ts';
import { instant } from '@stateforge-labs/session-ledger';
import type { Section } from '@stateforge-labs/session-ledger';

test('kappa rows: usable at 0.6 and enough points', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `p${i}`);
    const moment = (id: string, labels: Readonly<Record<string, Label>>): LabelledMoment => ({ id: asText(id), labels: new Map(Object.entries(labels).map(([name, label]) => [asText(name), label])) });
    const labeller = ids.map((id, i) => moment(id, { a: i % 2 === 0 ? 0 : 1, b: i % 3 === 0 ? 1 : 0 }));
    const operator = ids.map((id, i) => moment(id, { a: i % 2 === 0 ? 0 : 1, b: i % 2 === 0 ? 0 : 1 }));
    const rows = kappaScores(operator, labeller, ['a', 'b', 'c'].map(asText));
    assert.deepEqual(rows.map((row) => row.usable), ['usable', 'unusable', 'unusable']);
    assert.deepEqual(rows.map((row) => row.n), [12, 12, 0]);
});
