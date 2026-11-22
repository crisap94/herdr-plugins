import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverageScore, driftOf, expandBriefsOf, policyScore, questionScore } from '#src/experiment/report-metrics.ts';
import type { Labels, ScoredAnswer } from '#src/experiment/report-metrics.ts';
import { choose } from '#src/experiment/report-rule.ts';
import type { ArmRating } from '#src/experiment/report-rule.ts';
import type { Label } from '#src/experiment/stats.ts';
import { brand } from '#src/recap/domain/brand.ts';
import type { Probability } from '#src/recap/domain/probability.ts';
import { textOf, type Text } from '#src/recap/domain/text.ts';

const probability = brand<number, 'Probability'>;
const milliseconds = brand<number, 'Milliseconds'>;
const count = brand<number, 'Count'>;
const usd = brand<number, 'Usd'>;
const keepAll = (): 'keep' => 'keep';

const SAFE = { closes_request: 1, announces_continuation: 0, asks_detailed_choice: 0, needs_verbatim: 0, changes_subject: 0, stuck: 0 } as const;
const UNSAFE = { ...SAFE, needs_verbatim: 1 } as const;
const scores = (answers: Readonly<Record<string, number>>): ReadonlyMap<Text, Probability> => new Map(Object.entries(answers).map(([name, value]) => [textOf(name), probability(value)]));
const labelSet = (labels: Readonly<Record<string, Label>>): ReadonlyMap<Text, Label> => new Map(Object.entries(labels).map(([name, value]) => [textOf(name), value]));
const row = (key: string, answers: Record<string, number>, tookMs = 100): ScoredAnswer => ({ key: textOf(key), kind: 'point', answers: scores(answers), tokens: count(10), costUsd: usd(0.01), tookMs: milliseconds(tookMs) });
const good = (high: number, low: number): Record<string, number> => ({ closes_request: high, announces_continuation: low, asks_detailed_choice: low, needs_verbatim: low, changes_subject: low, stuck: low });
const labels: Labels = new Map([['a', SAFE], ['b', UNSAFE], ['c', SAFE], ['d', UNSAFE]].map(([key, set]) => [textOf(key as string), labelSet(set as Record<string, Label>)]));
const NEEDS_VERBATIM = textOf('needs_verbatim');

test('policy: precision of compact and recall among the safe moments, by the verdict over the answers', () => {
    const rep = [row('a', good(0.9, 0.1)), row('b', good(0.9, 0.1)), row('c', good(0.2, 0.1)), row('d', { closes_request: 0.9 })];
    const metrics = policyScore(rep, labels, keepAll);
    assert.deepEqual([metrics.compact, metrics.safe, metrics.hits], [2, 2, 1]);
    assert.equal(metrics.precision, 0.5);
    assert.equal(metrics.recall, 0.5);
});

test('question metrics: AUC, drift between repetitions, undecided band, time and money', () => {
    const one = [row('a', { needs_verbatim: 0.1 }, 100), row('b', { needs_verbatim: 0.9 }, 300), row('c', { needs_verbatim: 0.5 }, 200), row('d', { needs_verbatim: 0.8 }, 200)];
    const two = [row('a', { needs_verbatim: 0.2 }), row('b', { needs_verbatim: 0.7 }), row('c', { needs_verbatim: 0.1 }), row('d', { needs_verbatim: 0.9 })];
    const metrics = questionScore([one, two], NEEDS_VERBATIM, labels);
    assert.equal(metrics.auc, 1);
    assert.ok(Math.abs((driftOf([one, two], NEEDS_VERBATIM) ?? Number.NaN) - (0.1 + 0.2 + 0.4 + 0.1) / 4) < 1e-9);
    assert.equal(metrics.undecided, 1 / 8);
    assert.equal(metrics.medianMs, 100);
    assert.ok(Math.abs(metrics.usd - 0.08) < 1e-9);
});

test('coverage AUC reads the brief labels', () => {
    const briefLabels: Labels = new Map([[textOf('p#0'), labelSet({ brief_keeps_fact: 1 })], [textOf('p#1'), labelSet({ brief_keeps_fact: 0 })]]);
    const rep: ScoredAnswer[] = [{ key: textOf('p#0'), kind: 'fact', answers: scores({ brief_keeps_fact: 0.9 }) }, { key: textOf('p#1'), kind: 'fact', answers: scores({ brief_keeps_fact: 0.2 }) }];
    assert.equal(coverageScore([rep, rep], briefLabels, 'brief_keeps_fact'), 1);
});

const rating = (name: string, precision: number, spread: number, harness: boolean, coverage = 0.8): ArmRating => ({ arm: textOf(name), precision: probability(precision), drift: probability(spread), coverageAuc: probability(coverage), harness: harness ? 'recap-only' : 'other' });

test('rule: a harness within 3 points of the best with low drift wins over a better Jev', () => {
    const decision = choose([rating('jev', 0.95, 0.02, false, 0.9), rating('haiku-low', 0.93, 0.1, true), rating('haiku-medium', 0.94, 0.2, true), rating('luna-low', 0.8, 0.05, true)]);
    assert.equal(decision.defaultArm, 'haiku-low');
    assert.equal(decision.coverageArm, 'jev');
});

test('rule: with no harness near the best, the most precise steady arm; with none steady, no default', () => {
    assert.equal(choose([rating('jev', 0.95, 0.02, false), rating('haiku-low', 0.8, 0.1, true)]).defaultArm, 'jev');
    assert.equal(choose([rating('jev', 0.95, 0.3, false), rating('haiku-low', 0.9, 0.4, true)]).defaultArm, null);
});

test('a brief answer row becomes one row per fact, the call on the first', () => {
    const expanded = expandBriefsOf([{ key: textOf('p'), kind: 'brief', answers: scores({ keeps_0: 0.9, keeps_1: 0.2, reason_1: 0.6 }), tokens: count(100), costUsd: usd(0.5), tookMs: milliseconds(700) }]);
    assert.deepEqual(expanded.map((item) => item.key), ['p#0', 'p#1']);
    assert.deepEqual([...(expanded[1]?.answers ?? [])], [['brief_keeps_fact', 0.2], ['brief_keeps_reason', 0.6]]);
    assert.deepEqual(expanded.map((item) => item.tookMs), [700, undefined]);
});
