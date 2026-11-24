import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLOT_TABLE } from '#src/daemon/slot-table.ts';
import { defaultOn } from '#src/daemon/slots/roll.ts';
import { parseVersion, type Line, type Version } from '#src/daemon/slots.ts';
import { startRoll, type Activity, type RollParts, type Successor } from '#src/daemon/view/roll.ts';
import { unknown } from '@stateforge-labs/session-ledger';
import { parseFsPath } from '#src/recap/domain/fs-path.ts';
import { parseText } from '@stateforge-labs/session-ledger';
import { causeOf } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';

interface Fake {
    readonly parts: RollParts;
    spawns: number;
    readonly logs: Line[];
    terminated: number;
    disk: Version | null;
    busy: boolean;
    spawned: boolean;
}

const version = (raw: string): Version => parseVersion(raw);

const OWN = must(parseFsPath('/plugin/bin/tab-recap.mjs'));

const herdrDown = unknown({ why: 'unreachable', detail: causeOf(must(parseText('no socket'))) });

const settle = async (): Promise<void> => {
    for (let round = 0; round < 5; round += 1) {
        await new Promise((resolve) => { setImmediate(resolve); });
    }
};

const tick = async (roll: ReturnType<typeof startRoll>): Promise<void> => {
    roll.tick?.();
    await settle();
};

const fake = (started: string | null): Fake => {
    const state: Fake = {
        parts: {
            started: started === null ? null : version(started),
            active: () => Promise.resolve(herdrDown),
            local: (): Successor => ({ version: state.disk, launcher: OWN }),
            activity: (): Activity => (state.busy ? 'compacting' : 'idle'),
            spawnWaiter: (): void => {
                state.spawns += 1;
                if (!state.spawned) {
                    throw new Error('no waiter');
                }
            },
            terminate: (): void => {
                state.terminated += 1;
            },
            log: (line: Line): void => {
                state.logs.push(line);
            },
        },
        spawns: 0,
        logs: [],
        terminated: 0,
        disk: null,
        busy: false,
        spawned: true,
    };
    return state;
};

test('herdr unreachable: the same version on disk never rolls', async () => {
    const state = fake('3.1.0');
    state.disk = version('3.1.0');
    const roll = startRoll(state.parts);
    await tick(roll);
    await tick(roll);
    await tick(roll);
    assert.equal(state.spawns, 0);
    assert.equal(state.terminated, 0);
});

test('a new version seen once does not roll yet', async () => {
    const state = fake('3.1.0');
    state.disk = version('3.2.0');
    await tick(startRoll(state.parts));
    assert.equal(state.spawns, 0);
    assert.equal(state.terminated, 0);
});

test('a new version seen at two ticks while idle starts the waiter, then terminates', async () => {
    const state = fake('3.1.0');
    state.disk = version('3.2.0');
    const roll = startRoll(state.parts);
    await tick(roll);
    await tick(roll);
    assert.equal(state.spawns, 1);
    assert.equal(state.terminated, 1);
    assert.deepEqual(state.logs, []);
});

test('a busy compaction defers the roll to the first idle tick', async () => {
    const state = fake('3.1.0');
    state.disk = version('3.2.0');
    state.busy = true;
    const roll = startRoll(state.parts);
    await tick(roll);
    await tick(roll);
    assert.equal(state.spawns, 0);
    assert.equal(state.terminated, 0);
    state.busy = false;
    await tick(roll);
    assert.equal(state.spawns, 1);
    assert.equal(state.terminated, 1);
});

test('a failed waiter logs one line and does not terminate', async () => {
    const state = fake('3.1.0');
    state.disk = version('3.2.0');
    state.spawned = false;
    const roll = startRoll(state.parts);
    await tick(roll);
    await tick(roll);
    await tick(roll);
    assert.equal(state.logs.length, 1);
    assert.equal(state.terminated, 0);
});

test('the daemon rolls at most once per process', async () => {
    const state = fake('3.1.0');
    state.disk = version('3.2.0');
    const roll = startRoll(state.parts);
    await tick(roll);
    await tick(roll);
    await tick(roll);
    await tick(roll);
    assert.equal(state.spawns, 1);
    assert.equal(state.terminated, 1);
});

test('an unknown start version never rolls', async () => {
    const state = fake(null);
    state.disk = version('3.2.0');
    const roll = startRoll(state.parts);
    await tick(roll);
    await tick(roll);
    assert.equal(state.spawns, 0);
    assert.equal(state.terminated, 0);
});

test('the roll slot is on by default', () => {
    assert.equal(defaultOn, 'on');
    const entry = SLOT_TABLE.find((candidate) => candidate.name === 'roll');
    assert.equal(entry?.defaultOn, 'on');
});
