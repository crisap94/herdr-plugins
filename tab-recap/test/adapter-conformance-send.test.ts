import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOT_QUEUED, Sender } from '#src/recap/application/compaction-send.ts';
import { Trail } from '#src/recap/application/compaction-trail.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { NO_SECTIONS } from '@stateforge-labs/session-ledger';
import { duration, instant } from '@stateforge-labs/session-ledger';
import { parseText } from '@stateforge-labs/session-ledger';
import { parseCompactionId } from '#src/recap/domain/ids.ts';
import { must } from '@stateforge-labs/session-ledger';
import { compacted, compactionDeps, failed, NOW, typingFleet } from '#test/fakes/compaction-fleet.ts';
import { seenLane } from '#test/support/seen.ts';

const TEXT = { material: { sections: NO_SECTIONS, web: null, note: must(parseText('keep the schema')) }, brief: null };

const trailOf = (ends: unknown[] = []): Trail => new Trail({ begin: () => must(parseCompactionId('cmp_t0')), advance: () => undefined, finish: (_id, end) => { ends.push(end); } }, must(parseCompactionId('cmp_t0')), () => instant(NOW));

test('every non-Claude kind takes the Codex path; target selection filters non-COMPACTABLE kinds', async () => {
    for (const kind of ['codex', 'opencode']) {
        const world = typingFleet({ 'w1:p9': 'idle' });
        const looks = [[], [], [], [], [], [], [], [], [compacted]];
        await new Sender(compactionDeps(world, 'focused', 'w1:p9', looks)).send(laneFrom(seenLane({ paneId: 'w1:p9', tabId: 'w1:t1', workspaceId: 'w1', agent: kind })), TEXT, trailOf(), NOT_QUEUED);
        assert.deepEqual(world.events, [`type w1:p9`, 'prompt w1:p9'], `${kind}: typed, then the restore message`);
        const [command, restore] = world.typed;
        assert.ok(command);
        assert.ok(restore);
        assert.deepEqual(command.pieces, ['/compact'], `${kind}: the bare command, in one piece`);
        assert.deepEqual(command.lineBehavior, { enterDelay: duration(300) }, `${kind}: preserve the Enter delay`);
        assert.equal(restore.text.startsWith('We just compacted this conversation.'), true, `${kind}: the restore message follows the compaction`);
        assert.deepEqual(restore.promptBehavior, { stall: 'accepts-stall' }, `${kind}: the restore prompt accepts a stall`);
        assert.ok(world.pauses.some((ms) => ms === 1000), `${kind}: polled, not read once`);

        const failing = typingFleet({ 'w1:p9': 'idle' });
        await new Sender(compactionDeps(failing, 'focused', 'w1:p9', [[failed]])).send(laneFrom(seenLane({ paneId: 'w1:p9', tabId: 'w1:t1', workspaceId: 'w1', agent: kind })), TEXT, trailOf(), NOT_QUEUED);
        assert.equal(failing.typed.length, 1, `${kind}: typed once, not retried`);
        assert.deepEqual(failing.pauses, [], `${kind}: a failure is not polled`);
    }
    const unknownKind = typingFleet({ 'w1:p9': 'idle' });
    const trailEnds: unknown[] = [];
    const refused = await new Sender(compactionDeps(unknownKind, 'focused', 'w1:p9')).send(laneFrom(seenLane({ paneId: 'w1:p9', tabId: 'w1:t1', workspaceId: 'w1', agent: 'zed' })), TEXT, trailOf(trailEnds), NOT_QUEUED);
    assert.equal(refused?.kind, 'unsupported');
    assert.deepEqual(unknownKind.typed, []);
    assert.deepEqual(trailEnds, [{ stage: 'failed', at: NOW, why: 'no compaction plan is registered for zed' }]);
});

test('pins today: an unconfirmed non-Claude compaction gets 20 looks and still gets the restore message', async () => {
    const world = typingFleet({ 'w1:p9': 'idle' });
    await new Sender(compactionDeps(world, 'focused', 'w1:p9', [[]])).send(laneFrom(seenLane({ paneId: 'w1:p9', tabId: 'w1:t1', workspaceId: 'w1', agent: 'codex' })), TEXT, trailOf(), NOT_QUEUED);
    assert.deepEqual([world.pauses.filter((ms) => ms === 1000).length, world.pauses.filter((ms) => ms === 300).length], [19, 60]);
    assert.equal(world.typed.length, 2, 'the command, then the restore message');
    assert.match(world.toasts.at(-1) ?? '', /could not confirm the compaction/);
});
