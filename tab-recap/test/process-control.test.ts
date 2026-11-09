import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { Spawner } from '#src/adapters/os/process/core.ts';
import { posixProcess } from '#src/adapters/os/process/control-posix.ts';

interface Call { readonly command: string; readonly args: readonly string[]; readonly options: Record<string, unknown> }
type Fake = EventEmitter & { stdout: PassThrough; stderr: PassThrough };

function fakeSpawner(): { spawner: Spawner; calls: Call[]; program: () => Fake } {
    const calls: Call[] = [];
    let latest: Fake | null = null;
    const spawner = ((command: string, args: readonly string[], options: Record<string, unknown>) => {
        calls.push({ command, args, options });
        const child = Object.assign(new EventEmitter(), {
            pid: 4242, stdout: new PassThrough(), stderr: new PassThrough(),
            stdin: Object.assign(new PassThrough(), { end: (): void => undefined }),
            kill: (): boolean => true, unref: (): void => undefined,
        });
        latest = child;
        return child;
    }) as unknown as Spawner;
    return { spawner, calls, program: () => { assert.ok(latest !== null); return latest; } };
}

test('posix: output and the exit code come through', async () => {
    const { spawner, program } = fakeSpawner();
    const pending = posixProcess(spawner).run('git', [], { input: '', timeoutMs: 5000, cwd: '.', env: {} });
    const child = program();
    child.stdout.write('hello');
    child.stderr.write('warn');
    await new Promise((resolve) => { setTimeout(resolve, 10); });
    child.emit('close', 3);
    assert.deepEqual(await pending, { code: 3, stdout: 'hello', stderr: 'warn', timedOut: false });
});

test('posix: the program runs detached, in its own process group', async () => {
    const { spawner, calls, program } = fakeSpawner();
    const pending = posixProcess(spawner).run('git', [], { input: '', timeoutMs: 5000, cwd: '.', env: {} });
    program().emit('close', 0);
    await pending;
    assert.deepEqual(calls.at(0)?.options['detached'], true);
});
