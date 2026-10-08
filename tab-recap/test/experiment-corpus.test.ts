import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hindsightOf, agentTextOf } from '#src/experiment/hindsight.ts';
import { outcomesOf } from '#src/experiment/outcomes.ts';
import type { Event, Outcome } from '#src/experiment/outcomes.ts';
import { readsOf, shellReads } from '#src/experiment/read-paths.ts';
import { seeded, shuffled } from '#src/experiment/seeded.ts';
import { stratify } from '#src/experiment/stratify.ts';
import type { Candidate } from '#src/experiment/stratify.ts';
import { onlyInRecent, verbatimLabel } from '#src/experiment/verbatim.ts';

test('seeded: the same seed gives the same order', () => {
    assert.deepEqual(shuffled([1, 2, 3, 4, 5, 6], seeded(42)), shuffled([1, 2, 3, 4, 5, 6], seeded(42)));
    assert.notDeepEqual(shuffled([1, 2, 3, 4, 5, 6, 7, 8], seeded(1)), shuffled([1, 2, 3, 4, 5, 6, 7, 8], seeded(2)));
});

const candidates = (): Candidate[] => Array.from({ length: 300 }, (_, i) => ({ id: `p${i}`, share: i % 3 === 0 ? 55 : 10, beforeBoundary: i % 25 === 0 }));

test('stratify: quotas, no point twice, boundary points first, shortfalls recorded', () => {
    const { picked, counts } = stratify(candidates());
    assert.equal(new Set(picked.map((p) => p.id)).size, picked.length);
    assert.equal(counts.boundary.got, 12);
    assert.equal(counts.high.got, 100 - 4);
    assert.deepEqual(counts.high.asked, 120);
    assert.equal(counts.random.got, 60);
    assert.deepEqual(stratify(candidates()), stratify(candidates()));
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

const tool = (...reads: string[]): Event => ({ kind: 'tool', reads });
const boundary: Extract<Event, { kind: 'boundary' }> = { kind: 'boundary', pos: 10, at: 1, trigger: 'auto', pre: 900, post: 100 };

test('outcomes: re-reads inside 50 before and 10 after, restated prompt by Jaccard', () => {
    const before: Event[] = [{ kind: 'prompt', text: 'please fix the login bug in auth' }, tool('/a.ts', '/b.ts'), tool('/c.ts')];
    const after: Event[] = [{ kind: 'prompt', text: 'fix the login bug in auth please' }, tool('/b.ts'), tool('/zzz.ts')];
    const outcome = outcomesOf([...before, boundary, ...after])[0] as Outcome;
    assert.equal(outcome.reReads, 1);
    assert.equal(outcome.restated, true);
    assert.equal(outcome.preTokens, 900);
});

test('outcomes: only the 10 calls after count, and a different prompt is not a restatement', () => {
    const after: Event[] = [...Array.from({ length: 10 }, () => tool('/n.ts')), tool('/a.ts'), { kind: 'prompt', text: 'completely different words entirely' }];
    const outcome = outcomesOf([{ kind: 'prompt', text: 'fix the login bug' }, tool('/a.ts'), boundary, ...after])[0] as Outcome;
    assert.equal(outcome.reReads, 0);
    assert.equal(outcome.restated, false);
});

test('hindsight: six entries or the character budget, and the next operator prompt', () => {
    const entries = Array.from({ length: 9 }, (_, i) => ({ role: i === 2 ? 'user' as const : 'agent' as const, text: `entry ${i} ${'x'.repeat(100)}` }));
    const found = hindsightOf(entries);
    assert.equal(found.following.length, 6);
    assert.match(found.next_prompt ?? '', /^entry 2/);
    const clipped = hindsightOf([{ role: 'agent', text: 'y'.repeat(9000) }], 6, 8000);
    assert.ok((clipped.following[0]?.text.length ?? 0) <= 8001);
    assert.ok(!agentTextOf(found).includes('entry 2'));
});

test('verbatim: a path, error line or hash only in the recent turns that the agent then uses', () => {
    const recent = 'ran tests\nError: ENOENT no such file /srv/app/config.yaml\nfixed at 3f9a2bc1d';
    assert.equal(verbatimLabel(recent, 'goal: ship the thing', 'now editing /srv/app/config.yaml'), 1);
    assert.equal(verbatimLabel(recent, 'goal: ship the thing', 'moving on to a new topic'), 0);
    assert.equal(verbatimLabel(recent, 'see /srv/app/config.yaml and 3f9a2bc1d and Error: ENOENT no such file /srv/app/config.yaml', 'now editing /srv/app/config.yaml'), 0);
    assert.ok(onlyInRecent(recent, '').includes('3f9a2bc1d'));
});

import { sectionsOf } from '#src/experiment/coverage.ts';
import { coverageLabelsOf, labelsOf } from '#src/experiment/label-prompt.ts';
import { pooled, retried } from '#src/experiment/pool.ts';

const fact = (section: string, text: string, state: 'open' | 'closed' = 'open', why: string | null = null): HistoryFact => ({ section, text, why, state, closedWhy: null, closedAt: null, firstAt: 1, lastAt: 2 });

test('coverage: the recap sections the brief job is given, from the open facts', () => {
    const history = [fact('goal', 'g'), fact('done', 'd'), fact('now', 'n', 'closed'), fact('decisions', 'x', 'open', 'because'), fact('links', 'l'), fact('rules', 'r')];
    assert.equal(sectionsOf(history).goal, 'g');
    assert.deepEqual(sectionsOf(history).rules, ['r']);
    assert.deepEqual(sectionsOf(history).now, []);
    assert.deepEqual(sectionsOf(history).decisions, ['x']);
});

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
    const out = await pooled([1, 2, 3, 4, 5, 6], 2, async (n) => { live += 1; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 5)); live -= 1; return n * 2; });
    assert.deepEqual(out, [2, 4, 6, 8, 10, 12]);
    assert.equal(peak, 2);
    const waits: number[] = [];
    let calls = 0;
    const last = await retried(() => { calls += 1; return Promise.resolve(calls); }, (n) => n >= 3, { baseMs: 10, sleep: (ms) => { waits.push(ms); return Promise.resolve(); } });
    assert.equal(last, 3);
    assert.deepEqual(waits, [10, 20]);
});

import type { HistoryFact } from '#src/ports/ledger.ts';
import type { Labelled } from '#src/experiment/kappa-report.ts';
import { kappaRows } from '#src/experiment/kappa-report.ts';

test('kappa rows: usable at 0.6 and enough points', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `p${i}`);
    const labeller: Labelled[] = ids.map((id, i) => ({ id, labels: { a: i % 2 === 0 ? 0 : 1, b: i % 3 === 0 ? 1 : 0 } }));
    const operator: Labelled[] = ids.map((id, i) => ({ id, labels: { a: i % 2 === 0 ? 0 : 1, b: i % 2 === 0 ? 0 : 1 } }));
    const rows = kappaRows(operator, labeller, ['a', 'b', 'c']);
    assert.deepEqual(rows.map((row) => row.usable), [true, false, false]);
    assert.deepEqual(rows.map((row) => row.n), [12, 12, 0]);
});
