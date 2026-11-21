import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RestoreText } from '@stateforge-labs/session-ledger';
import { createPreCompacts, type PreCompacts } from '#src/adapters/hooks/pre-compacts.ts';
import { createReceiver, type RestoreMode } from '#src/adapters/hooks/receiver.ts';
import { createTurnEnds } from '#src/adapters/hooks/turn-ends.ts';
import { NOT_QUEUED, Sender } from '#src/recap/application/compaction-send.ts';
import { wiringOf } from '#src/recap/application/twins/compaction-wiring/legacy.ts';
import { Trail } from '#src/recap/application/compaction-trail.ts';
import { laneFrom, type Lane } from '#src/recap/domain/lane.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { parseCompactionId } from '#src/recap/domain/ids.ts';
import { must } from '#src/protocol/result.ts';
import type { HookAnswer, HookCall } from '#src/wire/hooks/contract.ts';
import type { Mark } from '#src/ports/transcripts.ts';
import { compactionDeps, compacted, NOW, typingFleet, type Fleet } from '#test/fakes/compaction-fleet.ts';

const TEXT = { material: { sections: NO_SECTIONS, web: null, note: must(parseText('keep the schema')) }, brief: null };
const FACTS = 'open fact one';
const isRestoreText = (text: string): text is RestoreText => typeof text === 'string';

const trailOf = (): Trail => new Trail({ begin: () => 'cmp_t0', advance: () => undefined, finish: () => undefined }, must(parseCompactionId('cmp_t0')), () => instant(NOW));

const LANE: Lane = laneFrom({ paneId: 'w1:p9', tabId: 'w1:t1', workspaceId: 'w1', agent: 'codex', session: 'sess-1' });

const COMPACT_START: HookCall = { harness: 'codex', kind: 'session-start', native: 'SessionStart', session: 'sess-1', source: 'compact', cwd: null };

const hookOf = (preCompacts: PreCompacts, mode: RestoreMode): ((call: HookCall) => HookAnswer) => {
    const clock = { now: (): Instant => instant(NOW) };
    const receiver = createReceiver({
        followed: () => ({ tab: LANE.tab, pane: LANE.pane, lane: LANE }),
        lanesOf: () => [LANE],
        observe: () => undefined,
        recaps: { turnEnded: () => undefined },
        engine: {
            sessionStarted: () => undefined,
            compacted: () => {
                if (!isRestoreText(FACTS)) {
                    throw new Error('unreachable');
                }
                return FACTS;
            },
        },
        turnEnds: createTurnEnds(clock),
        preCompacts,
        claimIdle: () => 'declined',
        restoreMode: () => mode,
        clock,
        log: () => undefined,
    });
    return (call) => receiver.handle(call);
};

interface Run {
    readonly fleet: Fleet;
    readonly hooked: HookAnswer[];
}

const LOOKS: readonly (readonly Mark[])[] = [[], [], [], [], [], [], [], [], [compacted]];

async function compactWith(mode: RestoreMode, hookAt: 'during-confirm' | 'after-send'): Promise<Run> {
    const preCompacts = createPreCompacts();
    const hook = hookOf(preCompacts, mode);
    const hooked: HookAnswer[] = [];
    const fleet = typingFleet({ 'w1:p9': 'idle' });
    const base = compactionDeps(fleet, 'focused', 'w1:p9', LOOKS);
    let looks = 0;
    const marks = (lane: Lane): Promise<readonly Mark[]> => {
        looks += 1;
        if (hookAt === 'during-confirm' && looks === 3) {
            hooked.push(hook(COMPACT_START));
        }
        return base.marks(lane);
    };
    await new Sender(wiringOf({ ...base, marks, restores: preCompacts })).send(LANE, TEXT, trailOf(), NOT_QUEUED);
    if (hookAt === 'after-send') {
        hooked.push(hook(COMPACT_START));
    }
    return { fleet, hooked };
}

test('a typed Codex compaction reaches the agent once, with the same restore text, whichever of the hook and the confirmation comes first', async () => {
    const plain = typingFleet({ 'w1:p9': 'idle' });
    await new Sender(wiringOf(compactionDeps(plain, 'focused', 'w1:p9', LOOKS))).send(LANE, TEXT, trailOf(), NOT_QUEUED);
    assert.equal(plain.typed.length, 2, 'without the hook, the command and the typed restore');
    const restoreText = plain.typed[1]?.text;
    assert.ok(restoreText?.includes('keep the schema'));

    const hookFirst = await compactWith('on', 'during-confirm');
    assert.deepEqual(hookFirst.hooked, [{ kind: 'context', text: restoreText }], 'the hook returns the typed restore message itself');
    assert.equal(hookFirst.fleet.typed.length, 1, 'so only the command is typed');

    const typedFirst = await compactWith('on', 'after-send');
    assert.equal(typedFirst.fleet.typed.length, 2, 'the confirmation came first, so the restore is typed');
    assert.deepEqual(typedFirst.hooked, [{ kind: 'nothing' }], 'and the late hook sends nothing');

    const off = await compactWith('off', 'during-confirm');
    assert.equal(off.fleet.typed.length, 2, 'with TAB_RECAP_HOOKS_RESTORE off the restore is typed');
    assert.deepEqual(off.hooked, [{ kind: 'nothing' }]);
});

test('a compaction tab-recap did not type gets the open facts from the hook, also right after a typed one', async () => {
    const preCompacts = createPreCompacts();
    const hook = hookOf(preCompacts, 'on');
    assert.deepEqual(hook(COMPACT_START), { kind: 'context', text: FACTS });

    await new Sender(wiringOf({ ...compactionDeps(typingFleet({ 'w1:p9': 'idle' }), 'focused', 'w1:p9', LOOKS), restores: preCompacts })).send(LANE, TEXT, trailOf(), NOT_QUEUED);
    const session = LANE.session;
    assert.ok(session);
    preCompacts.mark(session, instant(NOW + 60_000));
    assert.deepEqual(hook(COMPACT_START), { kind: 'context', text: FACTS }, 'a later PreCompact clears the typed mark');
});
