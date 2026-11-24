import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGatePercent } from '@stateforge-labs/session-ledger';
import { gateOf as gateFrom } from '@stateforge-labs/session-ledger/compaction-timing';
import type { GateFacts } from '@stateforge-labs/session-ledger';
import { awaitedNames, backgroundItem, backgroundLabel, backgroundTool, flightDetail, flightOf, flightReason, holdsLane, NOT_AWAITING, NOTHING_IN_FLIGHT, observedFrom, runningCount, unreadable, ceilingOf } from '@stateforge-labs/session-ledger';
import type { Awaiting, BackgroundItem, Flight } from '@stateforge-labs/session-ledger';
import { textOf } from '@stateforge-labs/session-ledger';
import { countOf } from '@stateforge-labs/session-ledger';
import { duration, instant } from '@stateforge-labs/session-ledger';

const NOW = 10_000_000;
const monitor = backgroundItem(backgroundTool(textOf('Monitor')), backgroundLabel(textOf('open merge requests')));
const waitingOn = (names: string): Awaiting => ({ kind: 'on', names: awaitedNames(textOf(names)) });
const flight = (count: number, background: readonly BackgroundItem[], awaiting: Awaiting): Flight => flightOf(observedFrom(runningCount(countOf(count)), background, flightReason(textOf(`${count} running`))), awaiting);
const lane = (over: Partial<GateFacts> = {}): GateFacts => ({ kind: 'claude', kinds: ['claude'], shadowKinds: [], busy: 'free', flight: null, share: parseGatePercent(62), minimum: parseGatePercent(40), ceiling: parseGatePercent(80), now: instant(NOW), lastBreakAt: null, lastDecisionAt: null, cooldownMs: duration(600_000), unchanged: 'changed', ...over });

test('only foreground work holds the gate, at any share; background work never does', () => {
    assert.equal(gateFrom(lane({ flight: flight(1, [], NOT_AWAITING) })).gate, 'in-flight');
    assert.equal(gateFrom(lane({ flight: flight(1, [], NOT_AWAITING), share: parseGatePercent(95) })).gate, 'in-flight');
    assert.equal(gateFrom(lane({ flight: flight(0, [monitor, monitor], NOT_AWAITING) })).gate, 'ask');
    assert.equal(gateFrom(lane({ flight: flight(0, [monitor], NOT_AWAITING), share: parseGatePercent(95) })).gate, 'ceiling');
});

test('an unreadable reader holds the gate at any share', () => {
    const unknownFlight = flightOf(unreadable(flightReason(textOf('no transcript reader for claude'))), NOT_AWAITING);
    assert.equal(gateFrom(lane({ flight: unknownFlight })).gate, 'in-flight');
    assert.equal(gateFrom(lane({ flight: unknownFlight, share: parseGatePercent(95) })).gate, 'in-flight');
});

test('an awaited reply holds a lane below the ceiling and not at or above it', () => {
    const waiting = flight(0, [], waitingOn('reviewer,tester'));
    assert.equal(gateFrom(lane({ flight: waiting, share: parseGatePercent(79) })).gate, 'in-flight');
    assert.equal(gateFrom(lane({ flight: waiting, share: parseGatePercent(80) })).gate, 'ceiling');
    assert.equal(gateFrom(lane({ flight: waiting, share: parseGatePercent(92) })).gate, 'ceiling');
});

test('foreground work still holds a waiting lane at the ceiling', () => {
    assert.equal(gateFrom(lane({ flight: flight(2, [], waitingOn('reviewer')), share: parseGatePercent(92) })).gate, 'in-flight');
});

test('the cheap gates still come first', () => {
    assert.equal(gateFrom(lane({ flight: flight(1, [], waitingOn('x')), busy: 'busy', share: parseGatePercent(99) })).gate, 'busy');
    assert.equal(gateFrom(lane({ flight: flight(1, [], NOT_AWAITING), share: parseGatePercent(31) })).gate, 'below-minimum');
});

test('holdsLane is the one place the rule lives', () => {
    assert.equal(holdsLane(flightOf(NOTHING_IN_FLIGHT, NOT_AWAITING), ceilingOf(false)), false);
    assert.equal(holdsLane(flightOf(NOTHING_IN_FLIGHT, waitingOn('a')), ceilingOf(false)), true);
    assert.equal(holdsLane(flightOf(NOTHING_IN_FLIGHT, waitingOn('a')), ceilingOf(true)), false);
});

test('the detail says what held the lane, what the ceiling overrode, and what kept running', () => {
    assert.equal(flightDetail(flight(2, [], NOT_AWAITING), ceilingOf(false)), '2 running');
    assert.equal(flightDetail(flightOf(unreadable(flightReason(textOf('screen transcripts do not contain in-flight work'))), NOT_AWAITING), ceilingOf(true)), 'screen transcripts do not contain in-flight work');
    assert.equal(flightDetail(flight(0, [], waitingOn('reviewer')), ceilingOf(false)), 'awaiting reviewer');
    assert.equal(flightDetail(flight(0, [], waitingOn('reviewer')), ceilingOf(true)), 'ceiling-overrides-wait (awaiting reviewer)');
    assert.equal(flightDetail(flight(0, [monitor, monitor], NOT_AWAITING), ceilingOf(false)), 'background: 2 kept running');
    assert.equal(flightDetail(flight(0, [monitor], waitingOn('reviewer')), ceilingOf(true)), 'ceiling-overrides-wait (awaiting reviewer); background: 1 kept running');
    assert.equal(flightDetail(flight(0, [], NOT_AWAITING), ceilingOf(true)), null);
});

test('a background item without a label is named by its tool', () => {
    assert.deepEqual(backgroundItem(backgroundTool(textOf('Bash')), null), { tool: 'Bash', label: 'Bash' });
});
