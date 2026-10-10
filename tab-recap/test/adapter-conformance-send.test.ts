// What is typed into each kind of agent to compact it, today. The part that types and waits lives in `Sender`; these pin its
// per-kind branches. `PINS TODAY:` marks the oddities a refactor may change on purpose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sender } from '#src/recap/application/compaction-send.ts';
import { Trail } from '#src/recap/application/compaction-trail.ts';
import type { Records } from '#src/recap/application/compaction-trail.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import { compacted, depsOf, failed, fleet, flow, lane, NOW } from '#test/fakes/compaction-fleet.ts';

const TEXT = { material: { sections: NO_SECTIONS, web: null, note: 'keep the schema' }, brief: null };

/** A trail whose records are not kept: the send does not read them. */
const trailOf = (): Trail => new Trail({ advance: () => undefined, finish: () => undefined } as unknown as Records, 'cmp_t0', () => NOW);

// Each look at the records reads them four times when they say nothing (three 300 ms re-reads, `outcome.ts`), and a look that
// says nothing is followed by a one-second pause before the next look (`compaction-send.ts`, CONFIRM_MS).
test('opencode: its own /compact typed as a command, confirmed by polling its records, then the restore message; nothing is retried', async () => {
    const world = fleet({ 'w1:p4': 'idle' });
    // nothing for one whole look (four reads), the compaction on the second look
    await flow(world, 'focused', 'w1:p4', [[], [], [], [], [compacted]], [lane('w1:p4', 'opencode')]).run({ tab: 'w1:t1', pane: null, note: 'keep the schema' });
    assert.deepEqual(world.events, ['refresh', 'type w1:p4', 'prompt w1:p4']);
    assert.deepEqual([world.typed[0]?.typed, world.typed[0]?.pieces], [true, ['/compact']], '`/compact` alone, typed as a command');
    assert.equal(world.typed.length, 2, 'one command, one restore message');
    assert.ok(world.typed[1]?.text.startsWith('We just compacted this conversation.') && world.typed[1].text.includes('keep the schema'));
    assert.equal(world.typed[1]?.typed, undefined, 'the restore message is sent as a prompt');
    // PINS TODAY: the first look's three 300 ms re-reads, the one-second pause, then the second look confirms
    assert.deepEqual(world.pauses, [300, 300, 300, 1000]);
    assert.equal(world.claims.has('w1:p4'), false, 'the pane is released');
    assert.equal(world.toasts.length, 2);
});

// The claude branch is the only one with a retry and the only one that is not polled; every other kind takes the codex path,
// and an unknown kind takes it too. A kind that is not compactable never reaches this path through the flow, so the unknown
// kinds are driven through `Sender` directly.
test('every non-Claude kind takes the Codex path in the send: a bare /compact, polled for its records, the restore message after, no retry', async () => {
    for (const kind of ['codex', 'opencode', 'zed']) {
        // confirmed on the third look: two looks of nothing (four reads each), then the compaction
        const world = fleet({ 'w1:p9': 'idle' });
        const looks = [[], [], [], [], [], [], [], [], [compacted]];
        await new Sender(depsOf(world, 'focused', 'w1:p9', looks)).send(laneFrom({ paneId: 'w1:p9', tabId: 'w1:t1', workspaceId: 'w1', agent: kind }), TEXT, trailOf());
        assert.deepEqual(world.events, [`type w1:p9`, 'prompt w1:p9'], `${kind}: typed, then the restore message`);
        assert.deepEqual(world.typed[0]?.pieces, ['/compact'], `${kind}: the bare command, in one piece`);
        assert.equal(world.typed[1]?.text.startsWith('We just compacted this conversation.'), true, `${kind}: the restore message follows the compaction`);
        assert.deepEqual([world.pauses.filter((ms) => ms === 1000).length, world.pauses.filter((ms) => ms === 300).length], [2, 6], `${kind}: polled until the records say`);

        // a failure in the records is not retried for a non-claude kind, and no restore message is typed after it
        const failing = fleet({ 'w1:p9': 'idle' });
        await new Sender(depsOf(failing, 'focused', 'w1:p9', [[failed]])).send(laneFrom({ paneId: 'w1:p9', tabId: 'w1:t1', workspaceId: 'w1', agent: kind }), TEXT, trailOf());
        assert.equal(failing.typed.length, 1, `${kind}: typed once, not retried`);
        assert.deepEqual(failing.pauses, [], `${kind}: a failure is not polled`);
    }
});

// PINS TODAY: a non-claude compaction that the records never confirm is looked at 20 times, a second apart (19 one-second
// pauses), and each look reads the records four times (60 re-reads of 300 ms), then reported as unconfirmed. Only a `failed`
// verdict skips the restore message, so an unconfirmed one still gets it.
test('a non-claude compaction nothing confirms: looked at 20 times, a second apart, then unconfirmed; the restore message is still typed', async () => {
    const world = fleet({ 'w1:p9': 'idle' });
    await new Sender(depsOf(world, 'focused', 'w1:p9', [[]])).send(laneFrom({ paneId: 'w1:p9', tabId: 'w1:t1', workspaceId: 'w1', agent: 'zed' }), TEXT, trailOf());
    assert.deepEqual([world.pauses.filter((ms) => ms === 1000).length, world.pauses.filter((ms) => ms === 300).length], [19, 60]);
    assert.equal(world.typed.length, 2, 'the command, then the restore message');
    assert.match(world.toasts.at(-1) ?? '', /could not confirm the compaction/);
});
