import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { Spawner } from '#src/adapters/process-core.ts';
import { posixProcess } from '#src/adapters/process-posix.ts';
import { processFor } from '#src/adapters/process.ts';
import { windowsProcess } from '#src/adapters/process-windows.ts';

interface Call { readonly command: string; readonly args: readonly string[]; readonly options: Record<string, unknown> }
type Fake = EventEmitter & { stdout: PassThrough; stderr: PassThrough };

/** A spawner that never starts anything: `program` hangs until told, `taskkill` is just recorded. */
function fakeSpawner(): { spawner: Spawner; calls: Call[]; program: () => Fake } {
    const calls: Call[] = [];
    let latest: Fake | null = null;
    const spawner = ((command: string, args: readonly string[], options: Record<string, unknown>) => {
        calls.push({ command, args, options });
        const child = Object.assign(new EventEmitter(), {
            pid: command === 'taskkill' ? 1 : 4242, stdout: new PassThrough(), stderr: new PassThrough(),
            stdin: Object.assign(new PassThrough(), { end: (): void => undefined }),
            kill: (): boolean => true, unref: (): void => undefined,
        });
        if (command !== 'taskkill') {
            latest = child;
        }
        return child;
    }) as unknown as Spawner;
    return { spawner, calls, program: () => { assert.ok(latest !== null); return latest; } };
}

test('windows: a timeout ends the tree with `taskkill /PID <pid> /T /F`, hidden, and the program is not detached', async () => {
    const { spawner, calls } = fakeSpawner();
    const ran = await windowsProcess(spawner).run('claude', ['-p'], { input: '', timeoutMs: 20, killAfterMs: 20, cwd: '.', env: {} });
    assert.equal(ran.timedOut, true);
    assert.equal(ran.code, 137);
    assert.deepEqual(calls.at(0)?.options['detached'], false);
    assert.deepEqual(calls.at(0)?.options['windowsHide'], true);
    const kills = calls.filter((call) => call.command === 'taskkill');
    assert.ok(kills.length >= 1, 'the tree was killed');
    assert.deepEqual(kills.at(0)?.args, ['/PID', '4242', '/T', '/F']);
    assert.deepEqual(kills.at(0)?.options['windowsHide'], true);
});

test('windows: killTree on its own is the same command', () => {
    const { spawner, calls } = fakeSpawner();
    windowsProcess(spawner).killTree(77, true);
    assert.deepEqual(calls.map((call) => `${call.command} ${call.args.join(' ')}`), ['taskkill /PID 77 /T /F']);
});

test('windows: output and the exit code come through', async () => {
    const { spawner, program } = fakeSpawner();
    const pending = windowsProcess(spawner).run('git', [], { input: '', timeoutMs: 5000, cwd: '.', env: {} });
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

test('the platform picks the adapter: Windows gets taskkill, the others get process groups', () => {
    assert.notEqual(processFor('windows').killTree, processFor('linux').killTree);
    assert.equal(processFor('macos').killTree.name, processFor('linux').killTree.name, 'one POSIX adapter for both');
    const { spawner, calls } = fakeSpawner();
    windowsProcess(spawner).killTree(5, false);
    assert.equal(calls.at(0)?.command, 'taskkill');
});
