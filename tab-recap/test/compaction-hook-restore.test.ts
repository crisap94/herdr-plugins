import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPreCompacts } from '#src/adapters/hooks/pre-compacts.ts';
import { NOT_QUEUED, Sender } from '#src/recap/application/compaction-send.ts';
import { Trail } from '#src/recap/application/compaction-trail.ts';
import { laneFrom, type Lane } from '#src/recap/domain/lane.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { parseCompactionId } from '#src/recap/domain/ids.ts';
import { must } from '#src/protocol/result.ts';
import { compactionDeps, compacted, NOW, typingFleet } from '#test/fakes/compaction-fleet.ts';

const TEXT = { material: { sections: NO_SECTIONS, web: null, note: must(parseText('keep the schema')) }, brief: null };

const trailOf = (): Trail => new Trail({ begin: () => 'cmp_t0', advance: () => undefined, finish: () => undefined }, must(parseCompactionId('cmp_t0')), () => instant(NOW));

const seen = (session: string): Lane => laneFrom({ paneId: 'w1:p9', tabId: 'w1:t1', workspaceId: 'w1', agent: 'codex', session });

test('a session whose SessionStart compact hook already returned the restore is not sent the typed restore', async () => {
    const looks = [[], [], [], [], [], [], [], [], [compacted]];
    const preCompacts = createPreCompacts();
    const session = seen('sess-1').session;
    assert.ok(session);

    const plain = typingFleet({ 'w1:p9': 'idle' });
    await new Sender(compactionDeps(plain, 'focused', 'w1:p9', looks)).send(seen('sess-1'), TEXT, trailOf(), NOT_QUEUED);
    assert.equal(plain.typed.length, 2, 'without the hook, the command and the typed restore');

    preCompacts.restored(session, instant(NOW + 1000));
    const hooked = typingFleet({ 'w1:p9': 'idle' });
    await new Sender({ ...compactionDeps(hooked, 'focused', 'w1:p9', looks), hookRestoredAt: (s): Instant | null => preCompacts.servedSinceMark(s) }).send(seen('sess-1'), TEXT, trailOf(), NOT_QUEUED);
    assert.equal(hooked.typed.length, 1, 'the hook restored it, so only the command is typed');
    assert.deepEqual(hooked.typed.map((t) => t.pieces), [['/compact']]);

    preCompacts.mark(session, instant(NOW + 2000));
    const remarked = typingFleet({ 'w1:p9': 'idle' });
    await new Sender({ ...compactionDeps(remarked, 'focused', 'w1:p9', looks), hookRestoredAt: (s): Instant | null => preCompacts.servedSinceMark(s) }).send(seen('sess-1'), TEXT, trailOf(), NOT_QUEUED);
    assert.equal(remarked.typed.length, 2, 'a PreCompact mark after the restore means the restore is due again');
});
