import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, symlinkSync, accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';
import { FakeHcCore } from '@stateforge-labs/herdr-sdk/core/test-kit';
import { scratch, type Fixture } from '#test/fixtures/git-repo.ts';
import { BUN_CACHE_OFF } from '#test/support/bun-env.ts';

const PLUGIN = join(import.meta.dirname, '..', '..', '..');
const ENTRY = join(PLUGIN, 'bin', 'tab-recap-desktop.ts');
const WITHIN = 15_000;

interface Ran {
    readonly code: number | null;
    readonly stdout: string;
    readonly stderr: string;
}

let fixture: Fixture;
let core: FakeHcCore;
let state: string;
let env: Record<string, string>;
let started: number | null = null;

const nap = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

const alive = (pid: number): boolean => {
    try { process.kill(pid, 0); return true; } catch { return false; }
};

function toolsDirectory(root: string): string {
    const bin = join(root, 'bin');
    mkdirSync(bin, { recursive: true });
    for (const name of ['sh', 'git']) {
        for (const directory of (process.env['PATH'] ?? '').split(delimiter)) {
            try {
                accessSync(join(directory, name), constants.X_OK);
                symlinkSync(join(directory, name), join(bin, name));
                break;
            } catch { }
        }
    }
    return bin;
}

function desktop(...args: readonly string[]): Promise<Ran> {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [ENTRY, ...args], { cwd: PLUGIN, env, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
        child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
        const timer = setTimeout(() => { child.kill('SIGKILL'); }, WITHIN);
        child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
    });
}

async function pidOfStatus(): Promise<number> {
    const deadline = Date.now() + WITHIN;
    while (Date.now() < deadline) {
        const match = /daemon\s+pid (\d+)/.exec((await desktop('status')).stdout);
        if (match !== null) { return Number(match[1]); }
        await nap(50);
    }
    throw new Error('the desktop daemon never showed in status');
}

before(async () => {
    core = await FakeHcCore.start();
    fixture = scratch('e2e-76-');
    state = join(fixture.root, 'state');
    const home = join(fixture.root, 'home');
    for (const directory of [state, join(home, 'config'), join(home, 'state'), join(home, 'data'), join(home, 'cache'), join(fixture.root, 'config')]) { mkdirSync(directory, { recursive: true }); }
    env = {
        PATH: toolsDirectory(fixture.root), HOME: home, XDG_CONFIG_HOME: join(home, 'config'), XDG_STATE_HOME: join(home, 'state'),
        XDG_DATA_HOME: join(home, 'data'), XDG_CACHE_HOME: join(home, 'cache'), HERDR_PLUGIN_CONFIG_DIR: join(fixture.root, 'config'),
        HERDR_PLUGIN_STATE_DIR: state, TAB_RECAP_STATE: state, HC_SOCKET: core.path, XDG_RUNTIME_DIR: join(fixture.root, 'run'), TAB_RECAP_LOCALE: 'en', TAB_RECAP_AUTOCOMPACT: 'off', ...BUN_CACHE_OFF,
    };
});

after(async () => {
    if (started !== null && alive(started)) {
        process.kill(started, 'SIGTERM');
        for (let tries = 0; tries < 200 && alive(started); tries += 1) { await nap(25); }
        if (alive(started)) { process.kill(started, 'SIGKILL'); }
    }
    await core.stop();
    fixture.clean();
});

test('status before any start says the daemon is not running and names the scratch state folder', { timeout: 30_000 }, async () => {
    const ran = await desktop('status');
    assert.equal(ran.code, 0, ran.stderr);
    assert.match(ran.stdout, /not running/);
    assert.ok(ran.stdout.includes(state), ran.stdout);
});

test('an unknown word, no word, a refresh and a doc with no tab are usage errors, exit 2', { timeout: 30_000 }, async () => {
    for (const args of [['nope'], [], ['refresh'], ['doc']]) {
        assert.equal((await desktop(...args)).code, 2, args.join(' '));
    }
});

test('start runs one desktop daemon that status names', { timeout: 30_000 }, async () => {
    const ran = await desktop('start');
    assert.equal(ran.code, 0, ran.stderr);
    const named = Number(/pid (\d+)/.exec(ran.stdout)?.[1]);
    assert.ok(Number.isInteger(named) && named > 0, ran.stdout);
    started = named;
    assert.equal(await pidOfStatus(), named);
    assert.ok(alive(named));
});

test('a second start says the daemon is already running and starts none', { timeout: 30_000 }, async () => {
    assert.notEqual(started, null);
    const ran = await desktop('start');
    assert.equal(ran.code, 0, ran.stderr);
    assert.equal(ran.stdout.trim(), `tab-recap: daemon already running (pid ${String(started)})`);
});

test('ensure leaves a running daemon alone', { timeout: 30_000 }, async () => {
    const ran = await desktop('ensure');
    assert.equal(ran.code, 0, ran.stderr);
    assert.equal(ran.stdout, '');
    assert.equal(await pidOfStatus(), started);
});

test('doc for a tab with no recap fails with exit 1 and prints nothing', { timeout: 30_000 }, async () => {
    const ran = await desktop('doc', 't-none');
    assert.equal(ran.code, 1);
    assert.equal(ran.stdout, '');
    assert.match(ran.stderr, /no recap for t-none/);
});

test('refresh queues a request for the tab and says so', { timeout: 30_000 }, async () => {
    const ran = await desktop('refresh', 't-one');
    assert.equal(ran.code, 0, ran.stderr);
    assert.match(ran.stdout, /t-one/);
});

test('stop ends the daemon and ensure then leaves it off', { timeout: 30_000 }, async () => {
    assert.notEqual(started, null);
    const pid = started as number;
    const ran = await desktop('stop');
    assert.equal(ran.code, 0, ran.stderr);
    const deadline = Date.now() + WITHIN;
    while (alive(pid) && Date.now() < deadline) { await nap(25); }
    assert.equal(alive(pid), false);
    assert.equal((await desktop('ensure')).code, 0);
    assert.match((await desktop('status')).stdout, /not running \(switched off\)/);
});
