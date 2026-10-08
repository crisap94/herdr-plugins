import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hindsightOf, agentTextOf } from '#src/experiment/hindsight.ts';
import { outcomesOf } from '#src/experiment/outcomes.ts';
import type { Event } from '#src/experiment/outcomes.ts';
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
    const [outcome] = outcomesOf([...before, boundary, ...after]);
    assert.equal(outcome?.reReads, 1);
    assert.equal(outcome?.restated, true);
    assert.equal(outcome?.preTokens, 900);
});

test('outcomes: only the 10 calls after count, and a different prompt is not a restatement', () => {
    const after: Event[] = [...Array.from({ length: 10 }, () => tool('/n.ts')), tool('/a.ts'), { kind: 'prompt', text: 'completely different words entirely' }];
    const [outcome] = outcomesOf([{ kind: 'prompt', text: 'fix the login bug' }, tool('/a.ts'), boundary, ...after]);
    assert.equal(outcome?.reReads, 0);
    assert.equal(outcome?.restated, false);
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
