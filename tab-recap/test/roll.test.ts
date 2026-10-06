import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stateStore } from '#src/adapters/db/database.ts';
import { shouldRoll } from '#src/adapters/plugin-version.ts';
import { shutDown } from '#src/daemon/shutdown.ts';
import type { ClosedAll } from '#src/ports/columns.ts';
import { unknown } from '#src/ports/unknowable.ts';

const pause = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

test('shouldRoll: only a different version, seen twice in a row, replaces a process', () => {
    assert.equal(shouldRoll('1.5.0', '1.5.0', '1.5.0'), false, 'nothing changed');
    assert.equal(shouldRoll('1.5.0', '1.5.1', null), false, 'first look at the new version: wait');
    assert.equal(shouldRoll('1.5.0', '1.5.1', '1.5.0'), false, 'the previous look still saw the old one');
    assert.equal(shouldRoll('1.5.0', '1.5.1', '1.5.1'), true, 'the same new version twice');
    assert.equal(shouldRoll('1.5.0', '1.5.2', '1.5.1'), false, 'still changing: wait');
    assert.equal(shouldRoll(null, '1.5.1', '1.5.1'), false, 'it never knew its own version');
    assert.equal(shouldRoll('1.5.0', null, null), false, 'an unreadable manifest is not a new version');
});

function fakeColumns(closeEvery: () => Promise<ClosedAll>): { columns: { closeEvery: () => Promise<ClosedAll> }; order: string[] } {
    const order: string[] = [];
    return { columns: { closeEvery: async (): Promise<ClosedAll> => { order.push('closing'); const result = await closeEvery(); order.push('closed'); return result; } }, order };
}

test('shutDown: stops folding FIRST, then waits for the whole batch and says how many were closed', async () => {
    const lines: string[] = [];
    const { columns, order } = fakeColumns(async () => { await pause(60); return { kind: 'closed', closed: 27, failed: 0 }; });
    const informer = { stop: (): void => { order.push('informer stopped'); } };
    await shutDown(columns, informer, (line) => { lines.push(line); });
    assert.deepEqual(order, ['informer stopped', 'closing', 'closed'], 'it did not return before the batch finished');
    assert.deepEqual(lines, ['stopping: closing every column', 'stopping: closed 27 columns']);
});

const run = async (closeEvery: () => Promise<ClosedAll>, ms?: number): Promise<string> => {
    const lines: string[] = [];
    await shutDown(fakeColumns(closeEvery).columns, { stop: (): void => undefined }, (line) => { lines.push(line); }, ms);
    return lines.at(-1) ?? '';
};

test('shutDown: singular, failures, an unreachable herdr and a batch that takes too long are each said — and each returns', async () => {
    assert.equal(await run(() => Promise.resolve({ kind: 'closed', closed: 1, failed: 0 })), 'stopping: closed 1 column');
    assert.equal(await run(() => Promise.resolve({ kind: 'closed', closed: 3, failed: 2 })), 'stopping: closed 3 columns, 2 could not be closed');
    assert.match(await run(() => Promise.resolve(unknown({ why: 'unreachable', detail: 'no socket' }))), /could not close the columns \(unreachable: no socket\)/);
    assert.match(await run(() => new Promise<ClosedAll>(() => undefined), 30), /took more than 0.03 s; leaving/);
});

/** util-linux `script` runs a command in a pty. (BSD script on macOS gives the child no tty when stdin is a pipe, so the real-pty test is Linux's.) */
function scriptArgs(command: string): string[] {
    return ['-qec', command, '/dev/null'];
}

function hasScript(): boolean {
    try {
        execFileSync('sh', ['-c', 'command -v script'], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

/** The node process running `entry`: found by its command line, so it does not matter whether `script` put a shell in between. */
function pidOfNode(entry: string): string {
    const listing = execFileSync('ps', ['-axo', 'pid=,args='], { encoding: 'utf8' });
    const found = listing.split('\n').map((line) => /^\s*(\d+)\s+(.*)$/.exec(line)).find((match) => {
        const args = match?.[2] ?? '';
        return args.includes(entry) && (args.startsWith(`${process.execPath} `) || args.startsWith('node '));
    });
    return found?.[1] ?? '';
}

test('the in-place roll is possible on this platform: process.execve exists', () => {
    assert.equal(typeof process.execve, 'function');
});

/** The real thing: a column process in a pty replaces itself in place when the code on disk changes version. */
test('a column process rolls to the new version in place: same pid, same terminal, the new code is what draws', { skip: hasScript() ? false : 'the `script` command (a pty) is not installed' }, async (t) => {
    if (process.platform === 'darwin') {
        t.skip('BSD script gives the column no tty when stdin is a pipe; covered on Linux');
        return;
    }
    const here = dirname(fileURLToPath(import.meta.url));
    const plugin = join(here, '..');
    const dir = mkdtempSync(join(tmpdir(), 'recap-roll-'));
    const state = join(dir, 'state');
    const code = join(dir, 'code');
    let script: ReturnType<typeof spawn> | null = null;
    try {
        mkdirSync(code, { recursive: true });
        cpSync(join(plugin, 'src'), join(code, 'src'), { recursive: true });
        for (const file of ['package.json', 'herdr-plugin.toml']) {
            cpSync(join(plugin, file), join(code, file));
        }
        const store = stateStore(state);
        if (store.kind !== 'ready') {
            throw new Error('a new state directory holds a database of this version');
        }
        store.views.writeTab({ tab: 'w1:t1', column: null, at: 1, lanes: [{ pane: 'w1:p1', agent: 'claude', status: 'idle', title: 'rolling', cwd: null }] });
        store.close();
        const toml = readFileSync(join(code, 'herdr-plugin.toml'), 'utf8');
        const old = /^version = "(\d+\.\d+\.\d+)"/m.exec(toml)?.[1] ?? '';
        assert.match(old, /^\d+\.\d+\.\d+$/);
        let output = '';
        const entry = join(code, 'src', 'column', 'main.ts');
        script = spawn('script', scriptArgs(`stty cols 70 rows 20; exec node ${entry}`), {
            cwd: code, stdio: ['pipe', 'pipe', 'ignore'],
            env: { ...process.env, TAB_RECAP_TAB: 'w1:t1', TAB_RECAP_STATE: state, TAB_RECAP_COLUMN_POLL_MS: '150', HERDR_ENV: '', HERDR_SOCKET_PATH: join(dir, 'none.sock') },
        });
        script.stdout?.setEncoding('utf8').on('data', (chunk: string) => { output += chunk; });
        const until = async (needle: string, ms = 8000): Promise<boolean> => {
            const deadline = Date.now() + ms;
            while (!output.includes(needle) && Date.now() < deadline) {
                await pause(50);
            }
            return output.includes(needle);
        };
        const nodePid = (): string => pidOfNode(entry);
        assert.ok(await until(`v${old}`), `the column draws its version (${old})`);
        const before = nodePid();
        assert.match(before, /^\d+$/);
        writeFileSync(join(code, 'herdr-plugin.toml'), toml.replace(`version = "${old}"`, 'version = "9.8.7"'));
        assert.ok(await until('v9.8.7'), 'the new code draws the new version');
        assert.equal(nodePid(), before, 'the same process, replaced in place: herdr sees no pane close');
        assert.ok(script.exitCode === null, 'and the terminal session is still there');
    } finally {
        script?.kill('SIGKILL');
        try { execFileSync('pkill', ['-f', join(dir, 'code')]); } catch { /* none left */ }
        rmSync(dir, { recursive: true });
    }
});
