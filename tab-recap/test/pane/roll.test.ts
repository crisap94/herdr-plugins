import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLOT_TABLE } from '#src/daemon/slot-table.ts';
import { defaultOn } from '#src/daemon/slots/roll.ts';
import { parseVersion, type Line, type Version } from '#src/daemon/slots.ts';
import { startRoll, type Activity, type RollParts } from '#src/daemon/view/roll.ts';

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

const fake = (started: string | null): Fake => {
    const state: Fake = {
        parts: {
            started: started === null ? null : version(started),
            diskVersion: (): Version | null => state.disk,
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

test('the same version on disk never rolls', () => {
    const state = fake('3.1.0');
    state.disk = version('3.1.0');
    const roll = startRoll(state.parts);
    roll.tick?.();
    roll.tick?.();
    roll.tick?.();
    assert.equal(state.spawns, 0);
    assert.equal(state.terminated, 0);
});

test('a new version seen once does not roll yet', () => {
    const state = fake('3.1.0');
    state.disk = version('3.2.0');
    startRoll(state.parts).tick?.();
    assert.equal(state.spawns, 0);
    assert.equal(state.terminated, 0);
});

test('a new version seen at two ticks while idle starts the waiter, then terminates', () => {
    const state = fake('3.1.0');
    state.disk = version('3.2.0');
    const roll = startRoll(state.parts);
    roll.tick?.();
    roll.tick?.();
    assert.equal(state.spawns, 1);
    assert.equal(state.terminated, 1);
    assert.deepEqual(state.logs, []);
});

test('a busy compaction defers the roll to the first idle tick', () => {
    const state = fake('3.1.0');
    state.disk = version('3.2.0');
    state.busy = true;
    const roll = startRoll(state.parts);
    roll.tick?.();
    roll.tick?.();
    assert.equal(state.spawns, 0);
    assert.equal(state.terminated, 0);
    state.busy = false;
    roll.tick?.();
    assert.equal(state.spawns, 1);
    assert.equal(state.terminated, 1);
});

test('a failed waiter logs one line and does not terminate', () => {
    const state = fake('3.1.0');
    state.disk = version('3.2.0');
    state.spawned = false;
    const roll = startRoll(state.parts);
    roll.tick?.();
    roll.tick?.();
    roll.tick?.();
    assert.equal(state.logs.length, 1);
    assert.equal(state.terminated, 0);
});

test('the daemon rolls at most once per process', () => {
    const state = fake('3.1.0');
    state.disk = version('3.2.0');
    const roll = startRoll(state.parts);
    roll.tick?.();
    roll.tick?.();
    roll.tick?.();
    roll.tick?.();
    assert.equal(state.spawns, 1);
    assert.equal(state.terminated, 1);
});

test('an unknown start version never rolls', () => {
    const state = fake(null);
    state.disk = version('3.2.0');
    const roll = startRoll(state.parts);
    roll.tick?.();
    roll.tick?.();
    assert.equal(state.spawns, 0);
    assert.equal(state.terminated, 0);
});

test('the roll slot is off by default', () => {
    assert.equal(defaultOn, 'off');
    const entry = SLOT_TABLE.find((candidate) => candidate.name === 'roll');
    assert.equal(entry?.defaultOn, 'off');
});
