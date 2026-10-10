import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sender } from '#src/recap/application/compaction-send.ts';
import { Trail } from '#src/recap/application/compaction-trail.ts';
import type { Records } from '#src/recap/application/compaction-trail.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import { compacted, compactionDeps, compactionFlow, failed, lane, NOW, typingFleet } from '#test/fakes/compaction-fleet.ts';

const TEXT = { material: { sections: NO_SECTIONS, web: null, note: 'keep the schema' }, brief: null };

const trailOf = (): Trail => new Trail({ advance: () => undefined, finish: () => undefined } as unknown as Records, 'cmp_t0', () => NOW);

test('opencode: its own /compact is confirmed on the second look, then restored; pins today: four reads per look and a one second gap', async () => {
    const world = typingFleet({ 'w1:p4': 'idle' });
    await compactionFlow(world, 'focused', 'w1:p4', [[], [], [], [], [compacted]], [lane('w1:p4', 'opencode')]).run({ tab: 'w1:t1', pane: null, note: 'keep the schema' });
    assert.deepEqual(world.events, ['refresh', 'type w1:p4', 'prompt w1:p4']);
    assert.deepEqual([world.typed[0]?.typed, world.typed[0]?.pieces], [true, ['/compact']], '`/compact` alone, typed as a command');
    assert.equal(world.typed.length, 2, 'one command, one restore message');
    assert.ok(world.typed[1]?.text.startsWith('We just compacted this conversation.') && world.typed[1].text.includes('keep the schema'));
    assert.equal(world.typed[1]?.typed, undefined, 'the restore message is sent as a prompt');
    assert.deepEqual(world.pauses, [300, 300, 300, 1000]);
    assert.equal(world.claims.has('w1:p4'), false, 'the pane is released');
    assert.match(world.toasts.at(-1) ?? '', /opencode compacted/);
});

test('pins today: an unknown kind sent directly takes the Codex path; target selection filters non-COMPACTABLE kinds', async () => {
    for (const kind of ['codex', 'opencode', 'zed']) {
        const world = typingFleet({ 'w1:p9': 'idle' });
        const looks = [[], [], [], [], [], [], [], [], [compacted]];
        await new Sender(compactionDeps(world, 'focused', 'w1:p9', looks)).send(laneFrom({ paneId: 'w1:p9', tabId: 'w1:t1', workspaceId: 'w1', agent: kind }), TEXT, trailOf());
        assert.deepEqual(world.events, [`type w1:p9`, 'prompt w1:p9'], `${kind}: typed, then the restore message`);
        assert.deepEqual(world.typed[0]?.pieces, ['/compact'], `${kind}: the bare command, in one piece`);
        assert.equal(world.typed[1]?.text.startsWith('We just compacted this conversation.'), true, `${kind}: the restore message follows the compaction`);
        assert.ok(world.pauses.some((ms) => ms === 1000), `${kind}: polled, not read once`);

        const failing = typingFleet({ 'w1:p9': 'idle' });
        await new Sender(compactionDeps(failing, 'focused', 'w1:p9', [[failed]])).send(laneFrom({ paneId: 'w1:p9', tabId: 'w1:t1', workspaceId: 'w1', agent: kind }), TEXT, trailOf());
        assert.equal(failing.typed.length, 1, `${kind}: typed once, not retried`);
        assert.deepEqual(failing.pauses, [], `${kind}: a failure is not polled`);
    }
});

test('pins today: an unconfirmed non-Claude compaction gets 20 looks and still gets the restore message', async () => {
    const world = typingFleet({ 'w1:p9': 'idle' });
    await new Sender(compactionDeps(world, 'focused', 'w1:p9', [[]])).send(laneFrom({ paneId: 'w1:p9', tabId: 'w1:t1', workspaceId: 'w1', agent: 'zed' }), TEXT, trailOf());
    assert.deepEqual([world.pauses.filter((ms) => ms === 1000).length, world.pauses.filter((ms) => ms === 300).length], [19, 60]);
    assert.equal(world.typed.length, 2, 'the command, then the restore message');
    assert.match(world.toasts.at(-1) ?? '', /could not confirm the compaction/);
});
