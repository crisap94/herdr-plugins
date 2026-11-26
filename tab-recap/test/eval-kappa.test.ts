import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textOf } from '@stateforge-labs/session-ledger';
import { agreementOf, kappaOf, trusted } from '#src/recap/application/eval-stats.ts';
import type { PairRecord } from '#src/ports/verdicts.ts';

const pairs = (judge: number, operator: number, both: number, neither: number): readonly PairRecord[] => [
    ...Array.from({ length: judge }, () => ({ check: textOf('I5'), judge: 'pass' as const, operator: 'fail' as const })),
    ...Array.from({ length: operator }, () => ({ check: textOf('I5'), judge: 'fail' as const, operator: 'pass' as const })),
    ...Array.from({ length: both }, () => ({ check: textOf('I5'), judge: 'pass' as const, operator: 'pass' as const })),
    ...Array.from({ length: neither }, () => ({ check: textOf('I5'), judge: 'fail' as const, operator: 'fail' as const })),
];

test('Cohen\'s kappa: perfect agreement is 1, chance level is 0, worse than chance is negative, and a check nobody ever fails has none', () => {
    assert.equal(kappaOf(pairs(0, 0, 10, 10)), 1);
    assert.equal(kappaOf(pairs(5, 5, 5, 5)), 0);
    assert.equal(kappaOf(pairs(8, 8, 2, 2)), -0.6);
    assert.equal(kappaOf(pairs(0, 0, 20, 0)), null, 'both always say pass: chance explains it');
    assert.equal(kappaOf([]), null);
    assert.equal(kappaOf(pairs(10, 0, 80, 10)), 0.62, '90 % agree with a skew: observed 0.9, chance 0.74');
    assert.equal(kappaOf(pairs(8, 2, 85, 5)), 0.45, '90 % agree and still under the bar, because the judge passes almost everything');
});

test('the bar is 0.6: a check at 0.62 is trusted, one at 0.45 is not, and one with no kappa does not claim to be', () => {
    const [good, weak, none] = [kappaOf(pairs(10, 0, 80, 10)), kappaOf(pairs(8, 2, 85, 5)), kappaOf(pairs(0, 0, 20, 0))].map((kappa) => trusted({ kappa }));
    assert.deepEqual([good, weak, none], [true, false, false]);
    const [row] = agreementOf(pairs(8, 2, 85, 5));
    assert.deepEqual([row?.percent, row?.kappa, row ? trusted(row) : null], [90, 0.45, false]);
});
