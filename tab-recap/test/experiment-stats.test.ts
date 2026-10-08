import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agreement, auc, brier, jaccard, kappa, quantile, undecidedRate, wordsOf } from '#src/experiment/stats.ts';

const near = (a: number, b: number): void => { assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`); };

test('auc: a perfect ranking is 1, a reversed one 0, all ties 0.5, one class NaN', () => {
    near(auc([{ score: 0.9, label: 1 }, { score: 0.8, label: 1 }, { score: 0.2, label: 0 }, { score: 0.1, label: 0 }]), 1);
    near(auc([{ score: 0.1, label: 1 }, { score: 0.2, label: 1 }, { score: 0.8, label: 0 }]), 0);
    near(auc([{ score: 0.5, label: 1 }, { score: 0.5, label: 0 }, { score: 0.5, label: 1 }, { score: 0.5, label: 0 }]), 0.5);
    assert.ok(Number.isNaN(auc([{ score: 0.5, label: 1 }])));
});

test('auc: matches the pairwise definition, ties counting half', () => {
    const points = [{ score: 0.9, label: 1 as const }, { score: 0.4, label: 1 as const }, { score: 0.4, label: 0 as const }, { score: 0.7, label: 0 as const }, { score: 0.1, label: 0 as const }];
    // pairs (pos, neg): .9>.4 .9>.7 .9>.1 → 3 · .4=.4 → .5, .4<.7 → 0, .4>.1 → 1 → 4.5 of 6
    near(auc(points), 4.5 / 6);
});

test('brier: mean squared distance from the label', () => {
    near(brier([{ score: 1, label: 1 }, { score: 0.5, label: 0 }]), 0.125);
    assert.ok(Number.isNaN(brier([])));
});

test('kappa: agreement beyond chance', () => {
    near(kappa([1, 1, 0, 0], [1, 1, 0, 0]), 1);
    near(kappa([1, 0, 1, 0], [0, 1, 0, 1]), -1);
    near(kappa([1, 1, 0, 0], [1, 0, 1, 0]), 0);
    assert.ok(Number.isNaN(kappa([], [])));
    assert.ok(Number.isNaN(kappa([1, 1], [1, 1])));
});

test('quantile, undecided band and agreement', () => {
    near(quantile([1, 2, 3, 4, 5], 0.5), 3);
    near(quantile([10, 20], 0.95), 19.5);
    near(undecidedRate([0.34, 0.35, 0.5, 0.65, 0.66]), 0.6);
    near(agreement([1, 0, 1, 1], [1, 0, 0, 1]), 0.75);
});

test('jaccard over word sets', () => {
    near(jaccard(wordsOf('Fix the login bug now'), wordsOf('fix the login bug')), 0.8);
    near(jaccard(wordsOf('a'), wordsOf('b')), 0);
});
