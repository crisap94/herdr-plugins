import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HANDOFF_OBSERVATIONS, HANDOFF_OBSERVE_MS } from '#src/recap/application/handoff-limits.ts';
import { unknown } from '#src/ports/unknowable.ts';
import type { HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { HandoffEvidence } from '#src/recap/domain/handoff-plan.ts';
import { duration } from '#src/recap/domain/time.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { confirmationOf, laneWith, planWith, readyOf, worldOf } from './fakes/handoff-delivery.ts';
import type { World } from './fakes/handoff-delivery.ts';

const TEXT = 'Handoff of the parser refactor.\n\nNext steps:\n  - finish the lexer\n  - run the suite';
const FAILED: HandoffOutcome = { kind: 'failed', reason: 'unconfirmed' };
const DELIVERED: HandoffOutcome = { kind: 'delivered' };

async function run(world: World, evidence: HandoffEvidence = 'either', lane: Lane = laneWith({ session: null }), ownTranscript = true, text = TEXT): Promise<HandoffOutcome> {
    const confirmer = confirmationOf(world);
    const target = readyOf(lane, planWith(evidence), ownTranscript);
    const baseline = await confirmer.baseline(target);
    return confirmer.confirm(target, baseline, text);
}

test('a transcript whose latest prompt is the handoff confirms delivery at the first observation', async () => {
    const world = worldOf({ latest: 'an earlier prompt' });
    world.onPause = (count: number): void => { if (count === 1) world.latest = TEXT; };
    assert.deepEqual(await run(world, 'transcript', laneWith()), DELIVERED);
    assert.equal(world.pauses.length, 1);
});

test('the same handoff text as the baseline is not mistaken for this delivery', async () => {
    const world = worldOf({ latest: TEXT });
    assert.deepEqual(await run(world, 'transcript', laneWith()), FAILED);
    assert.equal(world.pauses.length, HANDOFF_OBSERVATIONS);
});

test('a fresh lane whose transcript appears after the send is found by re-locating on the observation', async () => {
    const world = worldOf({ session: null, located: false, latest: null });
    world.onPause = (count: number): void => {
        if (count === 2) {
            world.session = 'sess-new';
            world.located = true;
            world.latest = TEXT;
        }
    };
    assert.deepEqual(await run(world, 'transcript', laneWith({ session: null })), DELIVERED);
    assert.equal(world.pauses.length, 2);
});

test('a session re-read that answers unknown keeps the session of the previous observation', async () => {
    const world = worldOf({ session: 'sess-new', located: true, latest: 'an earlier prompt' });
    world.onPause = (count: number): void => {
        if (count === 2) {
            world.session = unknown({ why: 'unreachable', detail: 'herdr' });
            world.latest = TEXT;
        }
    };
    assert.deepEqual(await run(world, 'transcript', laneWith({ session: null })), DELIVERED);
    assert.equal(world.pauses.length, 2);
});

test('an unconfirmed send gives up after exactly HANDOFF_OBSERVATIONS observations, one second apart', async () => {
    const world = worldOf({ latest: 'an earlier prompt' });
    assert.deepEqual(await run(world, 'either', laneWith()), FAILED);
    assert.equal(world.pauses.length, HANDOFF_OBSERVATIONS);
    assert.equal(world.statusReads, HANDOFF_OBSERVATIONS);
    assert.ok(world.pauses.every((ms) => ms === HANDOFF_OBSERVE_MS));
    assert.equal(world.sent.length, 0, 'the confirmation never sends');
});

test('the prefix is compared by code points and whitespace is collapsed on both sides', async () => {
    const world = worldOf({ latest: 'older' });
    world.onPause = (count: number): void => {
        if (count === 1) {
            world.latest = '  Handoff of the parser refactor.   Next steps: - finish the lexer - run the suite plus more  ';
        }
    };
    assert.deepEqual(await run(world, 'transcript', laneWith()), DELIVERED);
});

test('a prefix that diverges inside the first 400 code points is not confirmed, even where code units would agree', async () => {
    const text = '\u{1F600}'.repeat(300) + 'x'.repeat(200);
    const diverged = '\u{1F600}'.repeat(250) + 'z'.repeat(250);
    const world = worldOf({ latest: 'older' });
    world.onPause = (count: number): void => {
        if (count === 1) {
            world.latest = diverged;
        }
    };
    assert.deepEqual(await run(world, 'transcript', laneWith(), true, text), FAILED);
    assert.equal(world.pauses.length, HANDOFF_OBSERVATIONS);
});

test('the status evidence alone confirms when the plan declares status', async () => {
    const world = worldOf({ latest: 'older', agentState: unknown({ why: 'timeout', after: duration(1000) }) });
    world.onPause = (count: number): void => {
        if (count === 2) {
            world.agentState = { kind: 'agent', agent: 'claude', status: 'working' };
        }
    };
    assert.deepEqual(await run(world, 'status', laneWith()), DELIVERED);
    assert.equal(world.pauses.length, 2);
});

test('a plan that declares status ignores a transcript that shows the handoff', async () => {
    const world = worldOf({ latest: 'older' });
    world.onPause = (count: number): void => {
        if (count === 1) {
            world.latest = TEXT;
        }
    };
    assert.deepEqual(await run(world, 'status', laneWith()), FAILED);
    assert.equal(world.pauses.length, HANDOFF_OBSERVATIONS);
});

test('a transcript that is not the target\'s own uses status evidence only, even when it shows the handoff', async () => {
    const world = worldOf({ latest: 'older' });
    world.onPause = (count: number): void => {
        if (count === 1) {
            world.latest = TEXT;
        }
    };
    assert.deepEqual(await run(world, 'transcript', laneWith(), false), FAILED);
    assert.equal(world.locates, 0, 'the transcript is never located');
    assert.equal(world.statusReads, HANDOFF_OBSERVATIONS);
});

test('a shared directory confirms on working status at a later observation', async () => {
    const world = worldOf({ latest: 'older' });
    world.onPause = (count: number): void => {
        if (count === 2) {
            world.agentState = { kind: 'agent', agent: 'claude', status: 'working' };
        }
    };
    assert.deepEqual(await run(world, 'either', laneWith(), false), DELIVERED);
    assert.equal(world.pauses.length, 2);
});

test('an unreadable baseline leaves only status evidence, so a transcript that shows the handoff cannot confirm it', async () => {
    const world = worldOf({ unreadable: true });
    world.onPause = (count: number): void => {
        if (count === 1) {
            world.unreadable = false;
            world.latest = TEXT;
        }
    };
    assert.deepEqual(await run(world, 'transcript', laneWith()), FAILED);
    assert.equal(world.pauses.length, HANDOFF_OBSERVATIONS);
});

test('a throw while reading the transcript ends confirmation as unconfirmed at once', async () => {
    const world = worldOf({ latest: 'older' });
    world.onPause = (count: number): void => {
        if (count === 1) {
            world.faults = { latest: true };
        }
    };
    assert.deepEqual(await run(world, 'transcript', laneWith()), FAILED);
    assert.equal(world.pauses.length, 1, 'no further observation after the throw');
});

test('a throw while reading status ends confirmation as unconfirmed at once', async () => {
    const world = worldOf({ latest: 'older', faults: { status: true } });
    assert.deepEqual(await run(world, 'status', laneWith()), FAILED);
    assert.equal(world.pauses.length, 1);
});

test('an unknown status reading is no evidence and the observations go on', async () => {
    const world = worldOf({ latest: 'older', agentState: unknown({ why: 'timeout', after: duration(1000) }) });
    assert.deepEqual(await run(world, 'status', laneWith()), FAILED);
    assert.equal(world.pauses.length, HANDOFF_OBSERVATIONS);
});
