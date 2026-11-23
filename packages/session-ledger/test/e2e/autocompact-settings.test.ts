import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '@stateforge-labs/session-ledger/unstable/protocol/result.ts';
import { CEILING_DEFAULT, COOLDOWN_DEFAULT_MS, MINIMUM_MAX, MINIMUM_MIN, MISSED_FACTS, MISSED_FACTS_DEFAULT, parseAutocompactCeiling, parseAutocompactMode, parseAutocompactPercent, parseBackoff, parseBriefRetention, parseCeilingPolicy, parseCooldownMs, parseMissedFacts } from '@stateforge-labs/session-ledger/unstable/recap/domain/autocompact.ts';
import { millisecondsWithin, parseAutocompactStyle, probabilityWithin, STYLE_DEFAULT, STYLE_NUMBERS, STYLES, styleOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/autocompact-style.ts';
import { MUST_BE_LOW, ONE_MUST_BE_HIGH, parseThreshold, THRESHOLDS, verdictOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/autocompact-verdict.ts';
import { textOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';
import { parseMilliseconds } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';

const pair = (id: string, value: number): [string, number] => [id, value];

const answersOf = (low: number, high: number): Record<string, number> =>
    Object.fromEntries([...MUST_BE_LOW.map((id) => pair(id, low)), ...ONE_MUST_BE_HIGH.map((id) => pair(id, high))]);

test('the style word is read case- and space-insensitively and falls back to the default', () => {
    assert.deepEqual(STYLES, ['gentle', 'balanced', 'eager']);
    assert.equal(STYLE_DEFAULT, 'balanced');
    assert.equal(parseAutocompactStyle(' Eager '), 'eager');
    assert.equal(parseAutocompactStyle('GENTLE'), 'gentle');
    for (const input of ['bogus', '', undefined, null, 7]) {
        assert.equal(parseAutocompactStyle(input), STYLE_DEFAULT);
    }
    for (const style of STYLES) {
        assert.equal(styleOf(style), style);
        assert.equal(styleOf(style.toUpperCase()), style);
    }
});

test('each style carries ordered verdict thresholds and its own numbers', () => {
    assert.deepEqual(STYLE_NUMBERS.balanced.verdict, THRESHOLDS);
    for (const style of STYLES) {
        const band = STYLE_NUMBERS[style].verdict;
        assert.ok(band.safe < band.undecidedFrom);
        assert.ok(band.undecidedFrom < band.undecidedTo);
        assert.ok(band.undecidedTo < band.closes);
    }
    assert.deepEqual(STYLES.map((style) => STYLE_NUMBERS[style].ceiling), [85, 80, 65]);
    assert.deepEqual(STYLES.map((style) => STYLE_NUMBERS[style].cooldownMs), [1_200_000, 600_000, 300_000]);
    assert.deepEqual(STYLES.map((style) => STYLE_NUMBERS[style].coverageAtLeast), [0.75, 0.70, 0.60]);
    assert.deepEqual(STYLES.map((style) => STYLE_NUMBERS[style].recheckIdleMs), [null, null, 1_800_000]);
});

test('a threshold is a probability and anything else throws', () => {
    assert.deepEqual(THRESHOLDS, { safe: 0.30, closes: 0.70, undecidedFrom: 0.35, undecidedTo: 0.65 });
    for (const input of [0, 0.5, 1]) {
        assert.equal(parseThreshold(input), input);
    }
    for (const input of [1.5, -0.1, '0.5', Number.NaN, undefined]) {
        assert.throws(() => parseThreshold(input), /not a probability/);
    }
});

test('the verdict needs every listed answer, all the low ones low and one high one high', () => {
    assert.deepEqual(MUST_BE_LOW, ['announces_continuation', 'asks_detailed_choice', 'needs_verbatim', 'stuck']);
    assert.deepEqual(ONE_MUST_BE_HIGH, ['closes_request', 'changes_subject']);
    const all = answersOf(0.1, 0.9);
    assert.equal(verdictOf(all), 'compact');
    for (const id of [...MUST_BE_LOW, ...ONE_MUST_BE_HIGH]) {
        assert.equal(verdictOf(Object.fromEntries(Object.entries(all).filter(([key]) => key !== id))), 'wait');
    }
    for (const id of MUST_BE_LOW) {
        assert.equal(verdictOf({ ...all, [id]: 0.9 }), 'wait');
        assert.equal(verdictOf({ ...all, [id]: 0.5 }), 'undecided');
    }
    assert.equal(verdictOf({ ...all, [ONE_MUST_BE_HIGH[0]]: 0.1 }), 'compact');
    assert.equal(verdictOf(answersOf(0.1, 0.1)), 'wait');
});

test('the same answers compact under the eager style and stay undecided under the balanced one', () => {
    const answers = answersOf(0.35, 0.65);
    assert.equal(verdictOf(answers, STYLE_NUMBERS.eager.verdict), 'compact');
    assert.equal(verdictOf(answers, STYLE_NUMBERS.balanced.verdict), 'undecided');
    assert.equal(verdictOf(answers), 'undecided');
});

test('a probability setting is read only inside its range', () => {
    const range = { min: parseThreshold(0.05), max: parseThreshold(0.50) };
    assert.equal(probabilityWithin(textOf(' 0.25 '), range), 0.25);
    assert.equal(probabilityWithin(textOf('0.05'), range), 0.05);
    assert.equal(probabilityWithin(textOf('0.5'), range), 0.5);
    for (const input of ['0.04', '0.51', '', 'abc']) {
        assert.equal(probabilityWithin(textOf(input), range), null);
    }
    assert.equal(probabilityWithin(undefined, range), null);
});

test('a milliseconds setting is a whole number inside its range', () => {
    const range = { min: must(parseMilliseconds(60_000)), max: must(parseMilliseconds(86_400_000)) };
    assert.equal(millisecondsWithin(textOf('60000'), range), 60_000);
    assert.equal(millisecondsWithin(textOf(' 86400000 '), range), 86_400_000);
    for (const input of ['59999', '86400001', '90000.5', '', 'soon']) {
        assert.equal(millisecondsWithin(textOf(input), range), null);
    }
    assert.equal(millisecondsWithin(undefined, range), null);
});

test('the mode and the missed-facts word fall back to their defaults', () => {
    assert.equal(parseAutocompactMode('on'), 'on');
    assert.equal(parseAutocompactMode(' OFF '), 'off');
    assert.equal(parseAutocompactMode('Shadow'), 'shadow');
    for (const input of ['yes', '', undefined, 1]) {
        assert.equal(parseAutocompactMode(input), 'shadow');
    }
    assert.deepEqual(MISSED_FACTS, ['append', 'wait']);
    assert.equal(MISSED_FACTS_DEFAULT, 'append');
    for (const word of MISSED_FACTS) {
        assert.equal(parseMissedFacts(` ${word.toUpperCase()} `), word);
    }
    for (const input of ['drop', '', undefined, 3]) {
        assert.equal(parseMissedFacts(input), MISSED_FACTS_DEFAULT);
    }
});

test('a percent is a whole number inside the minimum range, with or without the sign, else the fallback', () => {
    assert.equal(parseAutocompactPercent('50', 40), 50);
    assert.equal(parseAutocompactPercent('50%', 40), 50);
    assert.equal(parseAutocompactPercent(' 70 ', 40), 70);
    assert.equal(parseAutocompactPercent(70, 40), 70);
    assert.equal(parseAutocompactPercent(String(MINIMUM_MIN), 40), MINIMUM_MIN);
    assert.equal(parseAutocompactPercent(String(MINIMUM_MAX), 40), MINIMUM_MAX);
    for (const input of [String(MINIMUM_MIN - 1), String(MINIMUM_MAX + 1), '50.5', '', 'half', undefined, null]) {
        assert.equal(parseAutocompactPercent(input, 40), 40);
    }
    assert.equal(MINIMUM_MIN, 10);
    assert.equal(MINIMUM_MAX, 95);
});

test('the ceiling sits above the minimum, from the setting, the style or ten points up', () => {
    const minimum = parseAutocompactPercent('50', MINIMUM_MIN);
    assert.equal(parseAutocompactCeiling('90', minimum), 90);
    assert.equal(parseAutocompactCeiling('', minimum), CEILING_DEFAULT);
    assert.equal(CEILING_DEFAULT, STYLE_NUMBERS.balanced.ceiling);
    for (const style of STYLES) {
        assert.equal(parseAutocompactCeiling(undefined, minimum, style), STYLE_NUMBERS[style].ceiling);
    }
    assert.equal(parseAutocompactCeiling('40', minimum), 60);
    assert.equal(parseAutocompactCeiling('50', minimum), 60);
    assert.equal(parseAutocompactCeiling('', parseAutocompactPercent('90', MINIMUM_MIN)), MINIMUM_MAX);
    assert.equal(parseAutocompactCeiling('', parseAutocompactPercent(String(MINIMUM_MAX), MINIMUM_MIN)), MINIMUM_MAX);
});

test('the cooldown reads its setting and falls back to the style number', () => {
    assert.equal(parseCooldownMs('0', 'balanced'), 0);
    assert.equal(parseCooldownMs(' 120000 ', 'balanced'), 120_000);
    assert.equal(parseCooldownMs('', 'balanced'), COOLDOWN_DEFAULT_MS);
    assert.equal(COOLDOWN_DEFAULT_MS, 600_000);
    for (const style of STYLES) {
        for (const input of ['', '-1', '1.5', 'soon', undefined, 5]) {
            assert.equal(parseCooldownMs(input, style), STYLE_NUMBERS[style].cooldownMs);
        }
    }
});

test('the ceiling policy, the backoff and the brief retention read their settings', () => {
    for (const input of ['off', ' OFF ']) {
        assert.equal(parseCeilingPolicy(input), 'blocked-by-check');
    }
    for (const input of ['on', '', undefined, 0]) {
        assert.equal(parseCeilingPolicy(input), 'overrides-check');
    }
    assert.deepEqual(parseBackoff('60000'), { kind: 'window', ms: 60_000 });
    assert.deepEqual(parseBackoff(' 86400000 '), { kind: 'window', ms: 86_400_000 });
    for (const input of ['0', '', '59999', '86400001', '90000.5', 'soon', undefined, 60_000]) {
        assert.deepEqual(parseBackoff(input), { kind: 'off' });
    }
    for (const input of ['', undefined, '61', '-1', '1.5', 'forever']) {
        assert.deepEqual(parseBriefRetention(input), { kind: 'days', value: 14 });
    }
    assert.deepEqual(parseBriefRetention('0'), { kind: 'none' });
    assert.deepEqual(parseBriefRetention(' 30 '), { kind: 'days', value: 30 });
    assert.deepEqual(parseBriefRetention('60'), { kind: 'days', value: 60 });
});
