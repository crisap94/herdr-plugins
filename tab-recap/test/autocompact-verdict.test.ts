import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGatePercent } from '@stateforge-labs/session-ledger';
import { gateOf as gateFrom } from '@stateforge-labs/session-ledger/compaction-timing';
import type { GateFacts } from '@stateforge-labs/session-ledger';
import { duration, instant } from '@stateforge-labs/session-ledger';
import { verdictOf } from '@stateforge-labs/session-ledger/compaction-timing';
import { flightOf, flightReason, NOT_AWAITING, observedFrom, runningCount, unreadable } from '@stateforge-labs/session-ledger';
import { textOf } from '@stateforge-labs/session-ledger';
import { countOf } from '@stateforge-labs/session-ledger';

const running = (count: number): GateFacts['flight'] => flightOf(observedFrom(runningCount(countOf(count)), [], flightReason(textOf(`${count} running`))), NOT_AWAITING);
const unreadableFlight = (): GateFacts['flight'] => flightOf(unreadable(flightReason(textOf('unreadable'))), NOT_AWAITING);

const NOW = 10_000_000;
const lane = (over: Partial<GateFacts> = {}): GateFacts => ({ kind: 'claude', kinds: ['claude'], shadowKinds: [], busy: 'free', flight: null, share: parseGatePercent(62), minimum: parseGatePercent(40), ceiling: parseGatePercent(80), now: instant(NOW), lastBreakAt: null, lastDecisionAt: null, cooldownMs: duration(600_000), unchanged: 'changed', ...over });

test('gates: below the minimum (31 % with minimum 40) stops before any model', () => {
    assert.deepEqual(gateFrom(lane({ share: parseGatePercent(31) })), { gate: 'below-minimum', recordOnly: 'may-act' });
});

test('gates: a background job still running (or a reader that cannot tell) is in flight', () => {
    assert.equal(gateFrom(lane({ flight: running(1) })).gate, 'in-flight');
    assert.equal(gateFrom(lane({ flight: unreadableFlight() })).gate, 'in-flight');
});

test('gates: a compaction in progress or requested is busy, and beats everything after it', () => {
    assert.equal(gateFrom(lane({ busy: 'busy', flight: running(2), share: parseGatePercent(99) })).gate, 'busy');
});

test('gates: over the ceiling (81 %) with nothing in flight is the ceiling; at the minimum exactly, ask', () => {
    assert.equal(gateFrom(lane({ share: parseGatePercent(81) })).gate, 'ceiling');
    assert.equal(gateFrom(lane({ share: parseGatePercent(80) })).gate, 'ceiling');
    assert.equal(gateFrom(lane({ share: parseGatePercent(40) })).gate, 'ask');
    assert.equal(gateFrom(lane()).gate, 'ask');
});

test('gates: within the cooldown since the last decision of any verdict (four minutes) or the last boundary; after it, ask', () => {
    assert.equal(gateFrom(lane({ lastDecisionAt: instant(NOW - 4 * 60_000) })).gate, 'cooldown');
    assert.equal(gateFrom(lane({ lastDecisionAt: instant(NOW - 4 * 60_000), share: parseGatePercent(90) })).gate, 'cooldown', 'a compact decision starts the cooldown too');
    assert.equal(gateFrom(lane({ lastBreakAt: instant(NOW - 4 * 60_000) })).gate, 'cooldown');
    assert.equal(gateFrom(lane({ lastBreakAt: instant(NOW - 4 * 60_000), share: parseGatePercent(90) })).gate, 'cooldown', 'the ceiling waits for the cooldown too');
    assert.equal(gateFrom(lane({ lastDecisionAt: instant(NOW - 600_000), lastBreakAt: instant(NOW - 9 * 3_600_000) })).gate, 'ask');
});

test('gates: an in-flight count not read yet (null) is passed over; the lane is asked, or below the minimum and no read is needed', () => {
    assert.equal(gateFrom(lane({ flight: null })).gate, 'ask');
    assert.equal(gateFrom(lane({ flight: null, share: parseGatePercent(81) })).gate, 'ceiling');
    assert.equal(gateFrom(lane({ flight: null, share: parseGatePercent(31) })).gate, 'below-minimum');
    assert.equal(gateFrom(lane({ flight: null, busy: 'busy' })).gate, 'busy');
    assert.equal(gateFrom(lane({ flight: null, lastDecisionAt: instant(NOW - 60_000) })).gate, 'cooldown');
});

test('gates: a kind outside the list is still gated and asked, but record-only', () => {
    assert.deepEqual(gateFrom(lane({ kind: 'codex' })), { gate: 'ask', recordOnly: 'record-only' });
    assert.deepEqual(gateFrom(lane({ kind: 'codex', kinds: ['claude', 'codex'] })), { gate: 'ask', recordOnly: 'may-act' });
});

test('gates: an enabled shadow kind stays record-only', () => {
    assert.deepEqual(gateFrom(lane({ kind: 'codex', kinds: ['claude', 'codex'], shadowKinds: ['codex'] })), { gate: 'ask', recordOnly: 'record-only' });
});

const answers = (over: Readonly<Record<string, number>> = {}): Record<string, number> => ({ closes_request: 0.95, announces_continuation: 0.05, asks_detailed_choice: 0.02, needs_verbatim: 0.10, changes_subject: 0.03, stuck: 0.01, ...over });

test('verdict: a finished release (0.95 · 0.05 · 0.02 · 0.10 · 0.03 · 0.01) compacts', () => {
    assert.equal(verdictOf(answers()), 'compact');
});

test('verdict: a detailed choice for the operator (0.88) waits', () => {
    assert.equal(verdictOf(answers({ asks_detailed_choice: 0.88 })), 'wait');
});

test('verdict: needs_verbatim 0.48 with everything else decisive is undecided; a wait that a band answer cannot change stays wait', () => {
    assert.equal(verdictOf(answers({ needs_verbatim: 0.48 })), 'undecided');
    assert.equal(verdictOf(answers({ needs_verbatim: 0.48, stuck: 0.9 })), 'wait');
    assert.equal(verdictOf(answers({ closes_request: 0.2, changes_subject: 0.1, needs_verbatim: 0.5 })), 'wait');
});

test('verdict: the bounds — 0.30 is safe, 0.31 waits, 0.35 and 0.65 are the band, 0.70 closes', () => {
    assert.equal(verdictOf(answers({ stuck: 0.30 })), 'compact');
    assert.equal(verdictOf(answers({ stuck: 0.31 })), 'wait');
    assert.equal(verdictOf(answers({ stuck: 0.35 })), 'undecided');
    assert.equal(verdictOf(answers({ stuck: 0.65 })), 'undecided');
    assert.equal(verdictOf(answers({ stuck: 0.66 })), 'wait');
    assert.equal(verdictOf(answers({ closes_request: 0.70, changes_subject: 0 })), 'compact');
    assert.equal(verdictOf(answers({ closes_request: 0.69, changes_subject: 0 })), 'wait');
});

test('verdict: either closes_request or changes_subject is enough; a band answer that the other makes needless does not undecide', () => {
    assert.equal(verdictOf(answers({ closes_request: 0.1, changes_subject: 0.9 })), 'compact');
    assert.equal(verdictOf(answers({ closes_request: 0.5, changes_subject: 0.9 })), 'compact');
    assert.equal(verdictOf(answers({ closes_request: 0.5, changes_subject: 0.1 })), 'undecided');
});

test('verdict: a missing answer waits', () => {
    const { stuck: _, ...rest } = answers();
    assert.equal(verdictOf(rest), 'wait');
});
