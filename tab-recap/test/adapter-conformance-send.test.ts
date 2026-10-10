import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sender } from '#src/recap/application/compaction-send.ts';
import { Trail } from '#src/recap/application/compaction-trail.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import { duration } from '#src/recap/domain/time.ts';
import { compacted, compactionDeps, compactionFlow, failed, lane, NOW, typingFleet } from '#test/fakes/compaction-fleet.ts';

const TEXT = { material: { sections: NO_SECTIONS, web: null, note: 'keep the schema' }, brief: null };

const trailOf = (ends: unknown[] = []): Trail => new Trail({ begin: () => 'cmp_t0', advance: () => undefined, finish: (_id, end) => { ends.push(end); } }, 'cmp_t0', () => NOW);

test('opencode: its own /compact is confirmed on the second look, then restored; pins today: four reads per look and a one second gap', async () => {
    const world = typingFleet({ 'w1:p4': 'idle' });
    await compactionFlow(world, 'focused', 'w1:p4', [[], [], [], [], [compacted]], [lane('w1:p4', 'opencode')]).run({ tab: 'w1:t1', pane: null, note: 'keep the schema' });
    assert.deepEqual(world.events, ['refresh', 'type w1:p4', 'prompt w1:p4']);
    assert.equal(world.typed.length, 2, 'one command, one restore message');
    const [command, restore] = world.typed;
    assert.ok(command);
    assert.ok(restore);
    assert.deepEqual([command.typed, command.pieces], [true, ['/compact']], '`/compact` alone, typed as a command');
    assert.ok(restore.text.startsWith('We just compacted this conversation.') && restore.text.includes('keep the schema'));
    assert.equal(restore.typed, undefined, 'the restore message is sent as a prompt');
    assert.deepEqual(command.lineBehavior, { enterDelay: duration(300) });
    assert.deepEqual(restore.promptBehavior, { acceptsStall: true });
    assert.deepEqual(world.pauses, [300, 300, 300, 1000]);
    assert.equal(world.claims.has('w1:p4'), false, 'the pane is released');
    assert.match(world.toasts.at(-1) ?? '', /opencode compacted/);
});

test('every non-Claude kind takes the Codex path; target selection filters non-COMPACTABLE kinds', async () => {
    for (const kind of ['codex', 'opencode']) {
        const world = typingFleet({ 'w1:p9': 'idle' });
        const looks = [[], [], [], [], [], [], [], [], [compacted]];
        await new Sender(compactionDeps(world, 'focused', 'w1:p9', looks)).send(laneFrom({ paneId: 'w1:p9', tabId: 'w1:t1', workspaceId: 'w1', agent: kind }), TEXT, trailOf());
        assert.deepEqual(world.events, [`type w1:p9`, 'prompt w1:p9'], `${kind}: typed, then the restore message`);
        const [command, restore] = world.typed;
        assert.ok(command);
        assert.ok(restore);
        assert.deepEqual(command.pieces, ['/compact'], `${kind}: the bare command, in one piece`);
        assert.deepEqual(command.lineBehavior, { enterDelay: duration(300) }, `${kind}: preserve the Enter delay`);
        assert.equal(restore.text.startsWith('We just compacted this conversation.'), true, `${kind}: the restore message follows the compaction`);
        assert.deepEqual(restore.promptBehavior, { acceptsStall: true }, `${kind}: the restore prompt accepts a stall`);
        assert.ok(world.pauses.some((ms) => ms === 1000), `${kind}: polled, not read once`);

        const failing = typingFleet({ 'w1:p9': 'idle' });
        await new Sender(compactionDeps(failing, 'focused', 'w1:p9', [[failed]])).send(laneFrom({ paneId: 'w1:p9', tabId: 'w1:t1', workspaceId: 'w1', agent: kind }), TEXT, trailOf());
        assert.equal(failing.typed.length, 1, `${kind}: typed once, not retried`);
        assert.deepEqual(failing.pauses, [], `${kind}: a failure is not polled`);
    }
    const unknownKind = typingFleet({ 'w1:p9': 'idle' });
    const trailEnds: unknown[] = [];
    const refused = await new Sender(compactionDeps(unknownKind, 'focused', 'w1:p9')).send(laneFrom({ paneId: 'w1:p9', tabId: 'w1:t1', workspaceId: 'w1', agent: 'zed' }), TEXT, trailOf(trailEnds));
    assert.equal(refused?.kind, 'unsupported');
    assert.deepEqual(unknownKind.typed, []);
    assert.deepEqual(trailEnds, [{ stage: 'failed', at: NOW, why: 'no compaction plan is registered for zed' }]);
});

test('pins today: an unconfirmed non-Claude compaction gets 20 looks and still gets the restore message', async () => {
    const world = typingFleet({ 'w1:p9': 'idle' });
    await new Sender(compactionDeps(world, 'focused', 'w1:p9', [[]])).send(laneFrom({ paneId: 'w1:p9', tabId: 'w1:t1', workspaceId: 'w1', agent: 'codex' }), TEXT, trailOf());
    assert.deepEqual([world.pauses.filter((ms) => ms === 1000).length, world.pauses.filter((ms) => ms === 300).length], [19, 60]);
    assert.equal(world.typed.length, 2, 'the command, then the restore message');
    assert.match(world.toasts.at(-1) ?? '', /could not confirm the compaction/);
});
