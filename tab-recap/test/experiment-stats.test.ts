import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aucOf, brierOf, jaccardOf, kappaOf, quantileMs, undecidedShare, wordsIn } from '#src/experiment/stats.ts';
import type { Label, ScoredLabel } from '#src/experiment/stats.ts';
import { brand } from '#src/recap/domain/brand.ts';
import { textOf } from '#src/recap/domain/text.ts';

const near = (a: number | null, b: number): void => { assert.ok(a !== null && Math.abs(a - b) < 1e-9, `${String(a)} ≠ ${b}`); };
const probability = brand<number, 'Probability'>;
const milliseconds = brand<number, 'Milliseconds'>;
const scored = (score: number, label: Label): ScoredLabel => ({ score: probability(score), label });
const quantile = (values: readonly number[], q: number): number | null => quantileMs(values.map((value) => milliseconds(value)), probability(q));

test('auc: a perfect ranking is 1, a reversed one 0, all ties 0.5, one class unknown', () => {
    near(aucOf([scored(0.9, 1), scored(0.8, 1), scored(0.2, 0), scored(0.1, 0)]), 1);
    near(aucOf([scored(0.1, 1), scored(0.2, 1), scored(0.8, 0)]), 0);
    near(aucOf([scored(0.5, 1), scored(0.5, 0), scored(0.5, 1), scored(0.5, 0)]), 0.5);
    assert.equal(aucOf([scored(0.5, 1)]), null);
});

test('auc: matches the pairwise definition, ties counting half', () => {
    near(aucOf([scored(0.9, 1), scored(0.4, 1), scored(0.4, 0), scored(0.7, 0), scored(0.1, 0)]), 4.5 / 6);
});

test('brier: mean squared distance from the label', () => {
    near(brierOf([scored(1, 1), scored(0.5, 0)]), 0.125);
    assert.equal(brierOf([]), null);
});

test('kappa: agreement beyond chance', () => {
    near(kappaOf([1, 1, 0, 0], [1, 1, 0, 0]), 1);
    near(kappaOf([1, 0, 1, 0], [0, 1, 0, 1]), -1);
    near(kappaOf([1, 1, 0, 0], [1, 0, 1, 0]), 0);
    assert.equal(kappaOf([], []), null);
    assert.equal(kappaOf([1, 1], [1, 1]), null);
});

test('quantile and undecided band', () => {
    near(quantile([1, 2, 3, 4, 5], 0.5), 3);
    near(quantile([10, 20], 0.95), 19.5);
    near(undecidedShare([0.34, 0.35, 0.5, 0.65, 0.66].map(probability)), 0.6);
});

test('jaccard over word sets', () => {
    near(jaccardOf(wordsIn(textOf('Fix the login bug now')), wordsIn(textOf('fix the login bug'))), 0.8);
    near(jaccardOf(wordsIn(textOf('a')), wordsIn(textOf('b'))), 0);
});

