import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ReadStream } from 'node:tty';
import { cookedExecve } from '../../src/pane/relay-env.ts';

type Execve = NonNullable<typeof process.execve>;
type Stdin = Pick<ReadStream, 'isTTY' | 'setRawMode'>;

const fakeStdin = (calls: boolean[], isTTY = true): Stdin => ({
    isTTY,
    setRawMode(mode: boolean): ReadStream {
        calls.push(mode);
        return this as unknown as ReadStream;
    },
});

test('cookedExecve turns raw mode off before a successful execve', () => {
    const calls: boolean[] = [];
    let seenAtExec: boolean[] = [];
    const recordingExecve = (): void => {
        seenAtExec = calls.slice();
    };
    cookedExecve(fakeStdin(calls), recordingExecve as unknown as Execve)('/bin/x', ['x'], {});
    assert.deepEqual(seenAtExec, [false]);
});

const throwingExecve: Execve = () => {
    throw new Error('nope');
};

test('cookedExecve restores raw mode when execve throws', () => {
    const calls: boolean[] = [];
    assert.throws(() => cookedExecve(fakeStdin(calls), throwingExecve)('/bin/x', ['x'], {}), /nope/u);
    assert.deepEqual(calls, [false, true]);
});

test('cookedExecve leaves a non-tty stdin alone and still execs once', () => {
    const calls: boolean[] = [];
    let execs = 0;
    const countingExecve = (): void => {
        execs += 1;
    };
    cookedExecve(fakeStdin(calls, false), countingExecve as unknown as Execve)('/bin/x', ['x'], {});
    assert.deepEqual(calls, []);
    assert.equal(execs, 1);
});
