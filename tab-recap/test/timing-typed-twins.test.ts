import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateFrom, jevFrom, parseGatePercent, policyFrom } from '#src/recap/domain/autocompact.ts';
import type { GateFacts } from '#src/recap/domain/autocompact.ts';
import { tuningFrom } from '#src/recap/domain/autocompact-style.ts';
import { backgroundItem, backgroundLabel, backgroundTool, flightOf, flightReason, NOT_AWAITING, observedFrom, runningCount } from '#src/recap/domain/in-flight.ts';
import type { Flight } from '#src/recap/domain/in-flight.ts';
import { parseText, type Text, textOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';
import { duration, instant } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';
import type { Milliseconds } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';
import { must } from '#src/protocol/result.ts';
import { countOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/count.ts';

const NOW = 10_000_000;
const flight = (count: number): Flight => flightOf(observedFrom(runningCount(countOf(count)), [backgroundItem(backgroundTool(textOf('Monitor')), backgroundLabel(textOf('mrs')))], flightReason(textOf(`${count} running`))), NOT_AWAITING);

interface GateInput {
    readonly kind: GateFacts['kind'];
    readonly kinds: GateFacts['kinds'];
    readonly shadowKinds: GateFacts['shadowKinds'];
    readonly busy: boolean;
    readonly flight: Flight | null;
    readonly share: number;
    readonly minimum: number;
    readonly ceiling: number;
    readonly now: number;
    readonly lastBreakAt: number | null;
    readonly lastDecisionAt: ReturnType<typeof instant> | null;
    readonly cooldownMs: number;
    readonly unchanged: boolean;
    readonly coverageBackoff?: boolean;
}

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

test('gateFrom reaches every gate', () => {
    assert.deepEqual(new Set(cases.map((each) => gateFrom(each.facts).gate)), new Set(['below-minimum', 'busy', 'in-flight', 'cooldown', 'unchanged', 'coverage-backoff', 'ceiling', 'ask']));
});

const typedOf = (env: Readonly<Record<string, string>>) => (key: string): Text | undefined => (env[key] === undefined ? undefined : must(parseText(env[key])));

test('tuningFrom reads the style and the recheck window', () => {
    assert.equal(tuningFrom(typedOf({ TAB_RECAP_AUTOCOMPACT_STYLE: 'eager' })).recheckIdleMs, 1_800_000 as Milliseconds);
    assert.equal(tuningFrom(typedOf({})).recheckIdleMs, tuningFrom(typedOf({ TAB_RECAP_AUTOCOMPACT_STYLE: 'nonsense' })).recheckIdleMs);
});

test('policyFrom and jevFrom read the settings they are given', () => {
    const policy = policyFrom(typedOf({ TAB_RECAP_AUTOCOMPACT: 'on', TAB_RECAP_AUTOCOMPACT_AT: '55%', TAB_RECAP_AUTOCOMPACT_CEILING: '90', TAB_RECAP_AUTOCOMPACT_COOLDOWN_MS: '1000' }));
    assert.deepEqual([policy.mode, policy.minimum, policy.ceiling, policy.cooldownMs], ['on', 55, 90, 1000]);
    assert.deepEqual(jevFrom(typedOf({ TAB_RECAP_JEV_URL: 'https://example.com/v1', TAB_RECAP_JEV_MODEL: 'jev-2' })), { url: 'https://example.com/v1', model: 'jev-2' });
    assert.equal(jevFrom(typedOf({ TAB_RECAP_JEV_URL: 'ftp://nope' })).url, jevFrom(typedOf({})).url);
});
