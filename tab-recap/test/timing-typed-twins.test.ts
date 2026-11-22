import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateFrom, gateOf, jevFrom, jevOf, parseGatePercent, policyFrom, policyOf } from '#src/recap/domain/autocompact.ts';
import type { GateFacts, GateInput } from '#src/recap/domain/autocompact.ts';
import { tuningFrom, tuningOf } from '#src/recap/domain/autocompact-style.ts';
import { backgroundItem, backgroundLabel, backgroundTool, flightOf, flightReason, NOT_AWAITING, observedFrom, runningCount } from '#src/recap/domain/in-flight.ts';
import type { Flight } from '#src/recap/domain/in-flight.ts';
import { parseText, type Text, textOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';
import { duration, instant } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';
import type { Milliseconds } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';
import { must } from '#src/protocol/result.ts';
import { countOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/count.ts';

const NOW = 10_000_000;
const flight = (count: number): Flight => flightOf(observedFrom(runningCount(countOf(count)), [backgroundItem(backgroundTool(textOf('Monitor')), backgroundLabel(textOf('mrs')))], flightReason(textOf(`${count} running`))), NOT_AWAITING);

interface Case { readonly name: string; readonly input: GateInput; readonly facts: GateFacts }

const base = (over: Partial<GateInput>): GateInput => ({ kind: 'claude', kinds: ['claude'], shadowKinds: [], busy: false, flight: null, share: 62, minimum: 40, ceiling: 80, now: NOW, lastBreakAt: null, lastDecisionAt: null, cooldownMs: 600_000, unchanged: false, ...over });

const factsOf = (input: GateInput): GateFacts => ({
    kind: input.kind, kinds: input.kinds, shadowKinds: input.shadowKinds, flight: input.flight, lastDecisionAt: input.lastDecisionAt,
    busy: input.busy ? 'busy' : 'free', unchanged: input.unchanged ? 'same' : 'changed',
    ...(input.coverageBackoff === true ? { coverageBackoff: 'backing-off' as const } : {}),
    share: parseGatePercent(input.share), minimum: parseGatePercent(input.minimum), ceiling: parseGatePercent(input.ceiling),
    now: instant(input.now), lastBreakAt: input.lastBreakAt === null ? null : instant(input.lastBreakAt), cooldownMs: duration(input.cooldownMs),
});

const inputs: readonly (readonly [string, GateInput])[] = [
    ['below the minimum', base({ share: 20 })],
    ['busy', base({ busy: true })],
    ['busy and below the minimum', base({ busy: true, share: 20 })],
    ['in flight below the ceiling', base({ flight: flight(1) })],
    ['in flight at the ceiling', base({ flight: flight(1), share: 80 })],
    ['background work only', base({ flight: flight(0), share: 62 })],
    ['cooldown after a break', base({ lastBreakAt: NOW - 1_000 })],
    ['cooldown after a decision', base({ lastDecisionAt: instant(NOW - 1_000) })],
    ['cooldown just over', base({ lastBreakAt: NOW - 600_000 })],
    ['unchanged', base({ unchanged: true })],
    ['coverage backoff below the ceiling', base({ coverageBackoff: true })],
    ['coverage backoff at the ceiling', base({ coverageBackoff: true, share: 80 })],
    ['coverage backoff off', base({ coverageBackoff: false })],
    ['at the ceiling', base({ share: 90 })],
    ['ask', base({})],
    ['a kind outside the list', base({ kind: 'codex' })],
    ['a shadow kind', base({ shadowKinds: ['claude'] })],
];

const cases: readonly Case[] = inputs.map(([name, input]) => ({ name, input, facts: factsOf(input) }));

test('gateFrom decides what gateOf decides, for every gate', () => {
    for (const each of cases) {
        assert.deepEqual(gateFrom(each.facts), gateOf(each.input), each.name);
    }
    assert.deepEqual(new Set(cases.map((each) => gateOf(each.input).gate)), new Set(['below-minimum', 'busy', 'in-flight', 'cooldown', 'unchanged', 'coverage-backoff', 'ceiling', 'ask']));
});

const readerOf = (env: Readonly<Record<string, string>>) => (key: string): string | undefined => env[key];
const typedOf = (env: Readonly<Record<string, string>>) => (key: string): Text | undefined => (env[key] === undefined ? undefined : must(parseText(env[key])));

const tuningEnvs: readonly Readonly<Record<string, string>>[] = [
    {},
    { TAB_RECAP_AUTOCOMPACT_STYLE: 'gentle' },
    { TAB_RECAP_AUTOCOMPACT_STYLE: 'Balanced ' },
    { TAB_RECAP_AUTOCOMPACT_STYLE: 'eager' },
    { TAB_RECAP_AUTOCOMPACT_STYLE: 'nonsense' },
    { TAB_RECAP_AUTOCOMPACT_SAFE_AT_MOST: '0.2', TAB_RECAP_AUTOCOMPACT_CLOSES_AT_LEAST: '0.8' },
    { TAB_RECAP_AUTOCOMPACT_SAFE_AT_MOST: '0.45', TAB_RECAP_AUTOCOMPACT_CLOSES_AT_LEAST: '0.55' },
    { TAB_RECAP_AUTOCOMPACT_SAFE_AT_MOST: '0.01', TAB_RECAP_AUTOCOMPACT_CLOSES_AT_LEAST: '0.99' },
    { TAB_RECAP_AUTOCOMPACT_SAFE_AT_MOST: 'abc', TAB_RECAP_AUTOCOMPACT_CLOSES_AT_LEAST: '' },
    { TAB_RECAP_AUTOCOMPACT_COVERAGE_AT_LEAST: '0.5' },
    { TAB_RECAP_AUTOCOMPACT_COVERAGE_AT_LEAST: '0.2' },
    { TAB_RECAP_AUTOCOMPACT_COVERAGE_AT_LEAST: '1e-1' },
    { TAB_RECAP_AUTOCOMPACT_COVERAGE_AT_LEAST: 'Infinity' },
    { TAB_RECAP_AUTOCOMPACT_RECHECK_IDLE_MS: '120000' },
    { TAB_RECAP_AUTOCOMPACT_RECHECK_IDLE_MS: '120000.5' },
    { TAB_RECAP_AUTOCOMPACT_RECHECK_IDLE_MS: '59999' },
    { TAB_RECAP_AUTOCOMPACT_RECHECK_IDLE_MS: '86400001' },
    { TAB_RECAP_AUTOCOMPACT_RECHECK_IDLE_MS: ' 0x1d4c0 ' },
    { TAB_RECAP_AUTOCOMPACT_STYLE: 'eager', TAB_RECAP_AUTOCOMPACT_RECHECK_IDLE_MS: 'soon' },
];

test('tuningFrom reads what tuningOf reads, for each style and for bad values', () => {
    for (const env of tuningEnvs) {
        assert.deepEqual(tuningFrom(typedOf(env)), tuningOf(readerOf(env)), JSON.stringify(env));
    }
    assert.equal(tuningFrom(typedOf({ TAB_RECAP_AUTOCOMPACT_STYLE: 'eager' })).recheckIdleMs, 1_800_000 as Milliseconds);
});

const policyEnvs: readonly Readonly<Record<string, string>>[] = [
    {},
    { TAB_RECAP_AUTOCOMPACT: 'on', TAB_RECAP_AUTOCOMPACT_AT: '55%', TAB_RECAP_AUTOCOMPACT_CEILING: '90', TAB_RECAP_AUTOCOMPACT_COOLDOWN_MS: '1000' },
    { TAB_RECAP_AUTOCOMPACT: 'off', TAB_RECAP_AUTOCOMPACT_STYLE: 'eager', TAB_RECAP_AUTOCOMPACT_KINDS: 'claude, codex', TAB_RECAP_AUTOCOMPACT_SHADOW_KINDS: 'claude' },
    { TAB_RECAP_AUTOCOMPACT_AT: '90', TAB_RECAP_AUTOCOMPACT_CEILING: '50', TAB_RECAP_AUTOCOMPACT_CEILING_OVERRIDES_CHECK: 'off', TAB_RECAP_AUTOCOMPACT_COVERAGE_BACKOFF_MS: '120000', TAB_RECAP_AUTOCOMPACT_MISSED_FACTS: 'wait' },
];

test('policyFrom and jevFrom read what policyOf and jevOf read', () => {
    for (const env of policyEnvs) {
        assert.deepEqual(policyFrom(typedOf(env)), policyOf(readerOf(env)), JSON.stringify(env));
    }
    for (const env of [{}, { TAB_RECAP_JEV_URL: 'https://example.com/v1', TAB_RECAP_JEV_MODEL: 'jev-2' }, { TAB_RECAP_JEV_URL: 'http://localhost:8080/x', TAB_RECAP_JEV_MODEL: '  ' }, { TAB_RECAP_JEV_URL: 'ftp://nope' }]) {
        assert.deepEqual(jevFrom(typedOf(env)), jevOf(readerOf(env)), JSON.stringify(env));
    }
});
