import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateOf } from '#src/recap/domain/autocompact.ts';
import type { GateInput } from '#src/recap/domain/autocompact.ts';
import { awaitedNames, backgroundItem, backgroundLabel, backgroundTool, flightDetail, flightOf, flightReason, holdsLane, NOT_AWAITING, NOTHING_IN_FLIGHT, observedFrom, runningCount, unreadable } from '#src/recap/domain/in-flight.ts';
import type { Awaiting, BackgroundItem, Flight } from '#src/recap/domain/in-flight.ts';

const NOW = 10_000_000;
const monitor = backgroundItem(backgroundTool('Monitor'), backgroundLabel('open merge requests'));
const waitingOn = (names: string): Awaiting => ({ kind: 'on', names: awaitedNames(names) });
const flight = (count: number, background: readonly BackgroundItem[], awaiting: Awaiting): Flight => flightOf(observedFrom(runningCount(count), background, flightReason(`${count} running`)), awaiting);
const lane = (over: Partial<GateInput> = {}): GateInput => ({ kind: 'claude', kinds: ['claude'], shadowKinds: [], busy: false, flight: null, share: 62, minimum: 40, ceiling: 80, now: NOW, lastBreakAt: null, lastDecisionAt: null, cooldownMs: 600_000, unchanged: false, ...over });

test('only foreground work holds the gate, at any share; background work never does', () => {
    assert.equal(gateOf(lane({ flight: flight(1, [], NOT_AWAITING) })).gate, 'in-flight');
    assert.equal(gateOf(lane({ flight: flight(1, [], NOT_AWAITING), share: 95 })).gate, 'in-flight');
    assert.equal(gateOf(lane({ flight: flight(0, [monitor, monitor], NOT_AWAITING) })).gate, 'ask');
    assert.equal(gateOf(lane({ flight: flight(0, [monitor], NOT_AWAITING), share: 95 })).gate, 'ceiling');
});

test('an unreadable reader holds the gate at any share', () => {
    const unknownFlight = flightOf(unreadable(flightReason('no transcript reader for claude')), NOT_AWAITING);
    assert.equal(gateOf(lane({ flight: unknownFlight })).gate, 'in-flight');
    assert.equal(gateOf(lane({ flight: unknownFlight, share: 95 })).gate, 'in-flight');
});

test('an awaited reply holds a lane below the ceiling and not at or above it', () => {
    const waiting = flight(0, [], waitingOn('reviewer,tester'));
    assert.equal(gateOf(lane({ flight: waiting, share: 79 })).gate, 'in-flight');
    assert.equal(gateOf(lane({ flight: waiting, share: 80 })).gate, 'ceiling');
    assert.equal(gateOf(lane({ flight: waiting, share: 92 })).gate, 'ceiling');
});

test('foreground work still holds a waiting lane at the ceiling', () => {
    assert.equal(gateOf(lane({ flight: flight(2, [], waitingOn('reviewer')), share: 92 })).gate, 'in-flight');
});

test('the cheap gates still come first', () => {
    assert.equal(gateOf(lane({ flight: flight(1, [], waitingOn('x')), busy: true, share: 99 })).gate, 'busy');
    assert.equal(gateOf(lane({ flight: flight(1, [], NOT_AWAITING), share: 31 })).gate, 'below-minimum');
});

test('holdsLane is the one place the rule lives', () => {
    assert.equal(holdsLane(flightOf(NOTHING_IN_FLIGHT, NOT_AWAITING), false), false);
    assert.equal(holdsLane(flightOf(NOTHING_IN_FLIGHT, waitingOn('a')), false), true);
    assert.equal(holdsLane(flightOf(NOTHING_IN_FLIGHT, waitingOn('a')), true), false);
});

test('the detail says what held the lane, what the ceiling overrode, and what kept running', () => {
    assert.equal(flightDetail(flight(2, [], NOT_AWAITING), false), '2 running');
    assert.equal(flightDetail(flightOf(unreadable(flightReason('screen transcripts do not contain in-flight work')), NOT_AWAITING), true), 'screen transcripts do not contain in-flight work');
    assert.equal(flightDetail(flight(0, [], waitingOn('reviewer')), false), 'awaiting reviewer');
    assert.equal(flightDetail(flight(0, [], waitingOn('reviewer')), true), 'ceiling-overrides-wait (awaiting reviewer)');
    assert.equal(flightDetail(flight(0, [monitor, monitor], NOT_AWAITING), false), 'background: 2 kept running');
    assert.equal(flightDetail(flight(0, [monitor], waitingOn('reviewer')), true), 'ceiling-overrides-wait (awaiting reviewer); background: 1 kept running');
    assert.equal(flightDetail(flight(0, [], NOT_AWAITING), true), null);
});

test('a background item without a label is named by its tool', () => {
    assert.deepEqual(backgroundItem(backgroundTool('Bash'), null), { tool: 'Bash', label: 'Bash' });
});
