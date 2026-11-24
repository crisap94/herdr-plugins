import { parseUsd } from '@stateforge-labs/session-ledger';
import { policyOf, tuningOf } from './fakes/settings-readers.ts';
import { instant } from '@stateforge-labs/session-ledger';
import { agentKind, paneId, tabId } from '#test/support/ids.ts';
import { must as mustParsed } from '@stateforge-labs/session-ledger';
import { parseCount, countOf } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProbability } from '@stateforge-labs/session-ledger';
import { checkCoverage, probabilityRequired } from '#src/recap/application/brief-coverage.ts';
import type { CheckedFact } from '@stateforge-labs/session-ledger';
import { styleLine } from '#src/recap/application/autocompact-listing.ts';
import { en } from '#src/i18n/en.ts';
import { es } from '#src/i18n/es.ts';
import { parseBackoff, parseBriefRetention, parseCeilingPolicy } from '@stateforge-labs/session-ledger';
import { STYLE_NUMBERS, styleOf } from '@stateforge-labs/session-ledger';
import { THRESHOLDS } from '@stateforge-labs/session-ledger';
import { verdictOf } from '@stateforge-labs/session-ledger/compaction-timing';
import type { Thresholds } from '@stateforge-labs/session-ledger';
import type { DeciderPort, DecidedAnswersResult } from '@stateforge-labs/session-ledger';
import { NOW, world, lane, tuningOfKeys } from './autocompact-world.ts';
import type { World } from './autocompact-world.ts';
import { decidedOf, textOf } from './fakes/decider-fixtures.ts';

const env = (keys: Readonly<Record<string, string>>) => (key: string): string | undefined => keys[key];

function styled(keys: Readonly<Record<string, string>>, startedAt = 0): World {
    return world({ ...policyOf(env(keys)), mode: 'on' }, true, startedAt, tuningOfKeys(keys));
}

function waitedMinutesAgo(w: World, minutes: number): void {
    w.store.decisions.record({ scope: tabId('w1:t1'), key: paneId('w1:p1'), agent: agentKind('claude'), at: instant(NOW - minutes * 60_000), mode: 'on', share: countOf(12), tokens: mustParsed(parseCount(120_000)), window: mustParsed(parseCount(1_000_000)), gate: 'ask', verdict: 'wait', askedVerdict: 'wait', answers: new Map(), coverage: null, coverageOutcome: null, coverageMs: null, coverageCostUsd: null, laneStatus: null, decider: null, costUsd: mustParsed(parseUsd(0)), tookMs: null, why: null });
}

const passes = async (style: string): Promise<boolean> => (await checkCoverage(textOf('the brief'), NEEDS, keeping(0.65), probabilityRequired(parseProbability(tuningOf(env({ TAB_RECAP_AUTOCOMPACT_STYLE: style })).coverageAtLeast)))).complete === 'present';

const keeping = (keeps: number): DeciderPort => ({ label: textOf('fake'), ask: (_state, questions): Promise<DecidedAnswersResult> => Promise.resolve(decidedOf(Object.fromEntries([...questions.keys()].map((id) => [id, keeps])))) });
const NEEDS: readonly CheckedFact[] = [{ section: 'needs', text: textOf('Keep the token'), why: null }];

test('balanced is today\'s numbers: the verdict 0.30 and 0.70 with the band 0.35–0.65, the pass mark 0.70, the ceiling 80, the cooldown ten minutes, no re-check', () => {
    assert.deepEqual(STYLE_NUMBERS.balanced, { verdict: THRESHOLDS, coverageAtLeast: 0.70, ceiling: 80, cooldownMs: 600_000, recheckIdleMs: null });
    assert.deepEqual(THRESHOLDS, { safe: 0.30, closes: 0.70, undecidedFrom: 0.35, undecidedTo: 0.65 });
    assert.deepEqual(tuningOf(() => undefined), { style: 'balanced', verdict: THRESHOLDS, coverageAtLeast: 0.70, recheckIdleMs: null });
});

test('the style is read as one of the three; any other value is balanced', () => {
    assert.deepEqual(['gentle', 'Eager', ' balanced ', 'aggressive', '', undefined].map(styleOf), ['gentle', 'eager', 'balanced', 'balanced', 'balanced', 'balanced']);
});

test('each style sets its numbers: gentle waits for more, eager acts sooner and re-checks an idle lane every thirty minutes', () => {
    assert.deepEqual(tuningOf(env({ TAB_RECAP_AUTOCOMPACT_STYLE: 'gentle' })), { style: 'gentle', verdict: { safe: 0.20, closes: 0.80, undecidedFrom: 0.30, undecidedTo: 0.70 }, coverageAtLeast: 0.75, recheckIdleMs: null });
    assert.deepEqual(tuningOf(env({ TAB_RECAP_AUTOCOMPACT_STYLE: 'eager' })), { style: 'eager', verdict: { safe: 0.40, closes: 0.60, undecidedFrom: 0.45, undecidedTo: 0.55 }, coverageAtLeast: 0.60, recheckIdleMs: 1_800_000 });
});

test('the verdict: the same answers are wait under gentle, compact under balanced, and compact under eager when the close is 0.65 (the band is 0.30–0.70 under gentle)', () => {
    const warned = { closes_request: 0.95, announces_continuation: 0.25, asks_detailed_choice: 0.02, needs_verbatim: 0.10, changes_subject: 0.03, stuck: 0.01 };
    assert.deepEqual(['gentle', 'balanced', 'eager'].map((style) => verdictOf(warned, tuningOf(env({ TAB_RECAP_AUTOCOMPACT_STYLE: style })).verdict)), ['wait', 'compact', 'compact']);
    const close = { closes_request: 0.65, announces_continuation: 0.15, asks_detailed_choice: 0.02, needs_verbatim: 0.10, changes_subject: 0.03, stuck: 0.01 };
    assert.deepEqual(['gentle', 'balanced', 'eager'].map((style) => verdictOf(close, tuningOf(env({ TAB_RECAP_AUTOCOMPACT_STYLE: style })).verdict)), ['undecided', 'undecided', 'compact']);
});

test('the brief check: a fact kept at 0.65 passes eager (pass mark 0.60) and fails balanced (0.70) and gentle (0.75)', async () => {
    assert.deepEqual([await passes('eager'), await passes('balanced'), await passes('gentle')], [true, false, false]);
});

test('the ceiling: gentle 85, balanced 80, eager 65 when the key is unset; an explicit ceiling wins; an invalid one is the style\'s', () => {
    assert.deepEqual(['gentle', 'balanced', 'eager'].map((style) => policyOf(env({ TAB_RECAP_AUTOCOMPACT_STYLE: style })).ceiling), [85, 80, 65]);
    assert.equal(policyOf(env({ TAB_RECAP_AUTOCOMPACT_STYLE: 'gentle', TAB_RECAP_AUTOCOMPACT_CEILING: '70' })).ceiling, 70);
    assert.equal(policyOf(env({ TAB_RECAP_AUTOCOMPACT_STYLE: 'eager', TAB_RECAP_AUTOCOMPACT_CEILING: 'high' })).ceiling, 65);
});

test('coverage settings default to ceiling override on, backoff off and fourteen-day brief retention', () => {
    const policy = policyOf(env({}));
    assert.equal(policy.ceilingPolicy, 'overrides-check');
    assert.deepEqual(policy.coverageBackoff, { kind: 'off' });
    assert.deepEqual(parseBackoff('30000'), { kind: 'off' });
    assert.deepEqual(parseBackoff('1800000'), { kind: 'window', ms: 1_800_000 });
    assert.deepEqual(parseBackoff('86400001'), { kind: 'off' });
    assert.deepEqual(parseBriefRetention(undefined), { kind: 'days', value: 14 });
    assert.deepEqual(parseBriefRetention('0'), { kind: 'none' });
    assert.deepEqual(parseBriefRetention('61'), { kind: 'days', value: 14 });
    assert.equal(policyOf(env({ TAB_RECAP_AUTOCOMPACT_CEILING_OVERRIDES_CHECK: 'off' })).ceilingPolicy, 'blocked-by-check');
});

test('the cooldown: gentle twenty minutes, balanced ten, eager five; an explicit one wins; an invalid one is the style\'s', () => {
    assert.deepEqual(['gentle', 'balanced', 'eager'].map((style) => policyOf(env({ TAB_RECAP_AUTOCOMPACT_STYLE: style })).cooldownMs), [1_200_000, 600_000, 300_000]);
    assert.equal(policyOf(env({ TAB_RECAP_AUTOCOMPACT_STYLE: 'eager', TAB_RECAP_AUTOCOMPACT_COOLDOWN_MS: '0' })).cooldownMs, 0);
    assert.equal(policyOf(env({ TAB_RECAP_AUTOCOMPACT_STYLE: 'eager', TAB_RECAP_AUTOCOMPACT_COOLDOWN_MS: 'soon' })).cooldownMs, 300_000);
});

test('the advanced keys: an explicit value in range wins; out of range or not a number falls back to the style\'s', () => {
    const verdict = (keys: Record<string, string>): Thresholds => tuningOf(env({ TAB_RECAP_AUTOCOMPACT_STYLE: 'eager', ...keys })).verdict;
    assert.equal(verdict({ TAB_RECAP_AUTOCOMPACT_SAFE_AT_MOST: '0.44' }).safe, 0.44, 'below eager\'s band start (0.45)');
    assert.equal(verdict({ TAB_RECAP_AUTOCOMPACT_SAFE_AT_MOST: '0.45' }).safe, 0.40, 'at the band start: the style\'s');
    assert.equal(verdict({ TAB_RECAP_AUTOCOMPACT_SAFE_AT_MOST: '0.9' }).safe, 0.40, 'above 0.50 falls back');
    assert.equal(verdict({ TAB_RECAP_AUTOCOMPACT_CLOSES_AT_LEAST: '0.57' }).closes, 0.57, 'above eager\'s band end (0.55)');
    assert.equal(verdict({ TAB_RECAP_AUTOCOMPACT_CLOSES_AT_LEAST: '0.55' }).closes, 0.60, 'at the band end: the style\'s');
    assert.equal(verdict({ TAB_RECAP_AUTOCOMPACT_CLOSES_AT_LEAST: 'high' }).closes, 0.60);
    assert.equal(tuningOf(env({ TAB_RECAP_AUTOCOMPACT_COVERAGE_AT_LEAST: '0.2' })).coverageAtLeast, 0.70, 'below 0.30 falls back to balanced');
    assert.equal(tuningOf(env({ TAB_RECAP_AUTOCOMPACT_COVERAGE_AT_LEAST: '0.85' })).coverageAtLeast, 0.85);
    assert.deepEqual(['60000', '150000', '86400000'].map((ms) => tuningOf(env({ TAB_RECAP_AUTOCOMPACT_RECHECK_IDLE_MS: ms })).recheckIdleMs), [60_000, 150_000, 86_400_000]);
    assert.deepEqual(['59999', '86400001', '1.5', 'x', ''].map((ms) => tuningOf(env({ TAB_RECAP_AUTOCOMPACT_RECHECK_IDLE_MS: ms })).recheckIdleMs), [null, null, null, null, null]);
    assert.equal(tuningOf(env({ TAB_RECAP_AUTOCOMPACT_STYLE: 'eager', TAB_RECAP_AUTOCOMPACT_RECHECK_IDLE_MS: 'never' })).recheckIdleMs, 1_800_000, 'the eager re-check when the key is not a number');
});

test('the gates: the ceiling of eager (65 %) gives compact with no model call, and balanced asks at 70 %', async () => {
    const eager = styled({ TAB_RECAP_AUTOCOMPACT_STYLE: 'eager' });
    eager.share = 70;
    await eager.service.consider(lane());
    assert.deepEqual([eager.asked.length, eager.store.decisions.newest(must(parseCount(1)))[0]?.gate], [0, 'ceiling']);
    const balanced = styled({ TAB_RECAP_AUTOCOMPACT_STYLE: 'balanced' });
    balanced.share = 70;
    await balanced.service.consider(lane());
    assert.equal(balanced.asked.length, 1);
});

test('the cooldown reaches the gate: eager asks six minutes after a decision, balanced and gentle are still in their cooldown', async () => {
    const outcomes = await Promise.all(['eager', 'balanced', 'gentle'].map(async (style) => {
        const w = styled({ TAB_RECAP_AUTOCOMPACT_STYLE: style });
        waitedMinutesAgo(w, 6);
        w.share = 62;
        await w.service.consider(lane());
        return w.asked.length === 1 ? 'asked' : w.store.decisions.skips()[0]?.gate;
    }));
    assert.deepEqual(outcomes, ['asked', 'cooldown', 'cooldown']);
});

test('the re-check reaches the gate: eager asks an idle wait lane again after thirty minutes at the same tokens; balanced and gentle never do', async () => {
    const outcomes = await Promise.all(['eager', 'balanced', 'gentle'].map(async (style) => {
        const w = styled({ TAB_RECAP_AUTOCOMPACT_STYLE: style });
        waitedMinutesAgo(w, 35);
        w.share = 12;
        await w.service.consider(lane());
        return { asked: w.asked.length, logged: w.logs.some((line) => line.endsWith('unchanged → recheck')) };
    }));
    assert.deepEqual(outcomes, [{ asked: 1, logged: true }, { asked: 0, logged: false }, { asked: 0, logged: false }]);
});

test('the re-check waits for its interval: twenty minutes idle is still unchanged under eager', async () => {
    const w = styled({ TAB_RECAP_AUTOCOMPACT_STYLE: 'eager' });
    waitedMinutesAgo(w, 20);
    w.share = 12;
    await w.service.consider(lane());
    assert.deepEqual([w.asked.length, w.store.decisions.skips().map((skip) => skip.gate)], [0, ['unchanged']]);
});

test('the re-check never bypasses the in-flight gate', async () => {
    const w = styled({ TAB_RECAP_AUTOCOMPACT_STYLE: 'eager' });
    waitedMinutesAgo(w, 35);
    w.share = 12;
    w.inFlight = 1;
    await w.service.consider(lane());
    assert.deepEqual([w.asked.length, w.store.decisions.skips().map((skip) => skip.gate)], [0, ['in-flight']]);
});

test('the re-check key works under any style: balanced with a re-check of one minute asks an idle wait lane again', async () => {
    const w = styled({ TAB_RECAP_AUTOCOMPACT_STYLE: 'balanced', TAB_RECAP_AUTOCOMPACT_RECHECK_IDLE_MS: '60000' });
    waitedMinutesAgo(w, 12);
    w.share = 12;
    await w.service.consider(lane());
    assert.equal(w.asked.length, 1, 'twelve minutes is past the ten-minute cooldown and the one-minute re-check');
});

test('the listing header names the style and its numbers in force', () => {
    const balanced = styleLine(policyOf(env({})), tuningOf(env({})), en.autocompactSettings);
    assert.equal(balanced, 'style balanced · warnings at most 0.30 · closes at least 0.70 · undecided 0.35–0.65 · pass mark 0.70 · ceiling 80 % · ceiling override on · coverage backoff off · missed facts append · cooldown 10 min · re-check never');
    const eagerKeys = { TAB_RECAP_AUTOCOMPACT_STYLE: 'eager' };
    assert.equal(styleLine(policyOf(env(eagerKeys)), tuningOf(env(eagerKeys)), en.autocompactSettings), 'style eager · warnings at most 0.40 · closes at least 0.60 · undecided 0.45–0.55 · pass mark 0.60 · ceiling 65 % · ceiling override on · coverage backoff off · missed facts append · cooldown 5 min · re-check 30 min');
    const seconds = { ...eagerKeys, TAB_RECAP_AUTOCOMPACT_COOLDOWN_MS: '90000', TAB_RECAP_AUTOCOMPACT_RECHECK_IDLE_MS: '150000' };
    assert.match(styleLine(policyOf(env(seconds)), tuningOf(env(seconds)), en.autocompactSettings), /ceiling override on · coverage backoff off · missed facts append · cooldown 90 s · re-check 150 s$/);
    assert.match(styleLine(policyOf(env({})), tuningOf(env({})), es.autocompactSettings), /límite anula cobertura sí · espera de cobertura off/);
});

const balancedWith = (keys: Record<string, string>): Thresholds => tuningOf(env(keys)).verdict;

test('the advanced keys cannot contradict the band: a safe number at or above the band start, or a close at or below its end, falls back', () => {
    assert.deepEqual([balancedWith({ TAB_RECAP_AUTOCOMPACT_SAFE_AT_MOST: '0.5' }).safe, balancedWith({ TAB_RECAP_AUTOCOMPACT_SAFE_AT_MOST: '0.35' }).safe, balancedWith({ TAB_RECAP_AUTOCOMPACT_SAFE_AT_MOST: '0.34' }).safe], [0.30, 0.30, 0.34]);
    assert.deepEqual([balancedWith({ TAB_RECAP_AUTOCOMPACT_CLOSES_AT_LEAST: '0.5' }).closes, balancedWith({ TAB_RECAP_AUTOCOMPACT_CLOSES_AT_LEAST: '0.65' }).closes, balancedWith({ TAB_RECAP_AUTOCOMPACT_CLOSES_AT_LEAST: '0.66' }).closes], [0.70, 0.70, 0.66]);
});

test('no answer sheet inside the band compacts: every answer at 0.5 is undecided under balanced even with both keys at 0.5', () => {
    const middling = { closes_request: 0.5, announces_continuation: 0.5, asks_detailed_choice: 0.5, needs_verbatim: 0.5, changes_subject: 0.5, stuck: 0.5 };
    const verdict = tuningOf(env({ TAB_RECAP_AUTOCOMPACT_SAFE_AT_MOST: '0.5', TAB_RECAP_AUTOCOMPACT_CLOSES_AT_LEAST: '0.5' })).verdict;
    assert.notEqual(verdictOf(middling, verdict), 'compact');
    assert.equal(verdictOf(middling, verdict), 'undecided');
});

test('out-of-range coverage settings fall back to their defaults; in-range ones are read', () => {
    assert.deepEqual([parseBackoff('59999'), parseBackoff('86400001'), parseBackoff('abc'), parseBackoff('-5')], [{ kind: 'off' }, { kind: 'off' }, { kind: 'off' }, { kind: 'off' }]);
    assert.deepEqual(parseBackoff('60000'), { kind: 'window', ms: 60_000 });
    assert.deepEqual([parseBriefRetention('-1'), parseBriefRetention('x'), parseBriefRetention('61')], [{ kind: 'days', value: 14 }, { kind: 'days', value: 14 }, { kind: 'days', value: 14 }]);
    assert.deepEqual([parseCeilingPolicy('maybe'), parseCeilingPolicy('off'), parseCeilingPolicy('ON')], ['overrides-check', 'blocked-by-check', 'overrides-check']);
});
