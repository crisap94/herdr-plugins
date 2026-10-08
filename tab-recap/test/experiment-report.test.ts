import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverageAuc, drift, policyMetrics, questionMetrics } from '#src/experiment/report-metrics.ts';
import type { Answer } from '#src/experiment/report-metrics.ts';
import { decide } from '#src/experiment/report-rule.ts';
import type { ArmSummary } from '#src/experiment/report-rule.ts';

const SAFE = { closes_request: 1, announces_continuation: 0, asks_detailed_choice: 0, needs_verbatim: 0, changes_subject: 0, stuck: 0 } as const;
const UNSAFE = { ...SAFE, needs_verbatim: 1 } as const;
const row = (key: string, answers: Record<string, number>, tookMs = 100): Answer => ({ key, kind: 'point', answers, tokens: 10, costUsd: 0.01, tookMs });
const good = (high: number, low: number): Record<string, number> => ({ closes_request: high, announces_continuation: low, asks_detailed_choice: low, needs_verbatim: low, changes_subject: low, stuck: low });
const labels = new Map<string, Readonly<Record<string, 0 | 1>>>([['a', SAFE], ['b', UNSAFE], ['c', SAFE], ['d', UNSAFE]]);

test('policy: precision of compact and recall among the safe moments, by the verdict over the answers', () => {
    const rep = [row('a', good(0.9, 0.1)), row('b', good(0.9, 0.1)), row('c', good(0.2, 0.1)), row('d', { closes_request: 0.9 })];
    const metrics = policyMetrics(rep, labels, () => true);
    assert.deepEqual([metrics.compact, metrics.safe, metrics.hits], [2, 2, 1]);
    assert.equal(metrics.precision, 0.5);
    assert.equal(metrics.recall, 0.5);
});

test('question metrics: AUC, drift between repetitions, undecided band, time and money', () => {
    const one = [row('a', { needs_verbatim: 0.1 }, 100), row('b', { needs_verbatim: 0.9 }, 300), row('c', { needs_verbatim: 0.5 }, 200), row('d', { needs_verbatim: 0.8 }, 200)];
    const two = [row('a', { needs_verbatim: 0.2 }), row('b', { needs_verbatim: 0.7 }), row('c', { needs_verbatim: 0.1 }), row('d', { needs_verbatim: 0.9 })];
    const metrics = questionMetrics([one, two], 'needs_verbatim', labels);
    assert.equal(metrics.auc, 1);
    assert.ok(Math.abs(drift([one, two], 'needs_verbatim') - (0.1 + 0.2 + 0.4 + 0.1) / 4) < 1e-9);
    assert.equal(metrics.undecided, 1 / 8);
    assert.equal(metrics.medianMs, 100);
    assert.ok(Math.abs(metrics.usd - 0.08) < 1e-9);
});

test('coverage AUC reads the brief labels', () => {
    const briefLabels = new Map<string, Readonly<Record<string, 0 | 1>>>([['p#0', { brief_keeps_fact: 1 }], ['p#1', { brief_keeps_fact: 0 }]]);
    const rep: Answer[] = [{ key: 'p#0', kind: 'fact', answers: { brief_keeps_fact: 0.9 } }, { key: 'p#1', kind: 'fact', answers: { brief_keeps_fact: 0.2 } }];
    assert.equal(coverageAuc([rep, rep], briefLabels, 'brief_keeps_fact'), 1);
});

const arm = (name: string, precision: number, spread: number, harness: boolean, coverage = 0.8): ArmSummary => ({ arm: name, precision, drift: spread, coverageAuc: coverage, needsOnlyRecapHarness: harness });

test('rule: a harness within 3 points of the best with low drift wins over a better Jev', () => {
    const decision = decide([arm('jev', 0.95, 0.02, false, 0.9), arm('haiku-low', 0.93, 0.1, true), arm('haiku-medium', 0.94, 0.2, true), arm('luna-low', 0.8, 0.05, true)]);
    assert.equal(decision.defaultArm, 'haiku-low');
    assert.equal(decision.coverageArm, 'jev');
});

test('rule: with no harness near the best, the most precise steady arm; with none steady, no default', () => {
    assert.equal(decide([arm('jev', 0.95, 0.02, false), arm('haiku-low', 0.8, 0.1, true)]).defaultArm, 'jev');
    assert.equal(decide([arm('jev', 0.95, 0.3, false), arm('haiku-low', 0.9, 0.4, true)]).defaultArm, null);
});

import { expandBriefs } from '#src/experiment/report-metrics.ts';

test('a brief answer row becomes one row per fact, the call on the first', () => {
    const expanded = expandBriefs([{ key: 'p', kind: 'brief', answers: { keeps_0: 0.9, keeps_1: 0.2, reason_1: 0.6 }, tokens: 100, costUsd: 0.5, tookMs: 700 }]);
    assert.deepEqual(expanded.map((item) => item.key), ['p#0', 'p#1']);
    assert.deepEqual(expanded[1]?.answers, { brief_keeps_fact: 0.2, brief_keeps_reason: 0.6 });
    assert.deepEqual(expanded.map((item) => item.tookMs), [700, undefined]);
});
