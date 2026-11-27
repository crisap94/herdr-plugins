import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderRefusal, supportOf } from '#src/host/policy.mjs';
import { scratch } from '#test/fixtures/git-repo.ts';
import { BUN_CACHE_OFF } from '#test/support/bun-env.ts';
import { daemonWorld, type DaemonWorld } from '../support/daemon-world.ts';
import { evalWorld, type EvalWorld } from '../support/eval-world.ts';

const PLUGIN = join(import.meta.dirname, '..', '..', '..');
const LAUNCH = new URL('../../../src/host/launch.mjs', import.meta.url).href;
const BUN_HOST = new URL('../../../src/host/bun-host.mjs', import.meta.url).href;
const ENTRY = new URL('../../fixtures/launch-entry.mjs', import.meta.url).href;
const OLD = { bunVersion: '1.0.0', execPath: '/old/bin/bun', platform: 'macos', path: '' };
const LINUX = { ...OLD, platform: 'linux' };

interface Launched {
    readonly code: number | null;
    readonly out: string;
    readonly err: string;
}

const hostOf = (host: object): string => JSON.stringify(host);

const processOn = (platform: string): string => `bunHost(${hostOf({ versions: { bun: '1.0.0' }, version: 'v26.3.0', execPath: '/b/bun', platform, env: { PATH: '/a:/b' } })})`;

const withVersion = (bunVersion: string, platform = 'linux'): string => hostOf({ ...OLD, bunVersion, platform });

const nap = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

describe('a command, the daemon and a pane on a Bun that is too old', () => {
    const fixture = scratch('tab-recap-launch-e2e-');

    const envOf = (locale: string): Record<string, string> => ({
        PATH: process.env['PATH'] ?? '', HOME: fixture.root, XDG_CONFIG_HOME: join(fixture.root, 'c'), XDG_STATE_HOME: join(fixture.root, 's'),
        HERDR_PLUGIN_CONFIG_DIR: join(fixture.root, 'config'), TAB_RECAP_STATE: join(fixture.root, 'state'), TAB_RECAP_LOCALE: locale, ...BUN_CACHE_OFF,
    });

    const launched = async (kind: string, hostSource: string, argv: readonly string[] = [], locale = 'en'): Promise<Launched> => {
        const script = `import { launch } from ${JSON.stringify(LAUNCH)}; import { bunHost } from ${JSON.stringify(BUN_HOST)}; await launch(${JSON.stringify(kind)}, ${JSON.stringify(ENTRY)}, { host: ${hostSource}, argv: ${JSON.stringify(argv)} });`;
        const child = spawn(process.execPath, ['-e', script], { env: envOf(locale), stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        let err = '';
        child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString(); });
        child.stderr.on('data', (chunk: Buffer) => { err += chunk.toString(); });
        const timer = setTimeout(() => { child.kill('SIGKILL'); }, 20_000);
        const code = await new Promise<number | null>((resolve) => { child.on('close', resolve); });
        clearTimeout(timer);
        return { code, out, err };
    };

    after(() => {
        fixture.clean();
    });

    test('a supported Bun loads the entry for a command, the daemon and a pane, without a word of its own', { timeout: 30_000 }, async () => {
        for (const kind of ['command', 'daemon', 'pane']) {
            for (const version of ['1.4.4', '1.5.0', '2.0.0']) {
                const done = await launched(kind, withVersion(version));
                assert.deepEqual([done.code, done.out, done.err], [0, 'entry ran\n', ''], `${kind} on ${version}`);
            }
        }
    });

    test('a command on a Bun below 1.4.4 stops with the refusal on stderr, exit 1, no stack and the entry never loaded', { timeout: 30_000 }, async () => {
        const done = await launched('command', hostOf(OLD), ['refresh']);
        assert.equal(done.code, 1);
        assert.match(done.err, /^tab-recap needs Bun >= 1\.4\.4, but this is 1\.0\.0 \(\/old\/bin\/bun\)\.\nTo fix it:\n  1\. Install Bun >= 1\.4\.4 \(/);
        assert.doesNotMatch(done.err, /\n\s+at /);
        assert.equal(done.out, '');
    });

    test('the edge falls between 1.4.3 and 1.4.4: older, blank, unreadable and Node versions are refused', { timeout: 30_000 }, async () => {
        for (const version of ['1.4.3', '1.3.99', '0.9.0', 'banana', '', 'node v24.21.0']) {
            const done = await launched('command', withVersion(version), ['refresh']);
            assert.equal(done.code, 1, `[${version}]`);
            assert.equal(done.out, '', `[${version}]`);
            assert.match(done.err, new RegExp(`but this is ${version.replace('.', '\\.')} \\(`), `[${version}]`);
        }
    });

    test('a Node that runs the launcher is read by the Host adapter as no Bun and refused', { timeout: 30_000 }, async () => {
        const node = hostOf({ versions: {}, version: 'v24.21.0', execPath: '/n/node', platform: 'linux', env: { PATH: '/x' } });
        const done = await launched('command', `bunHost(${node})`, ['refresh']);
        assert.equal(done.code, 1);
        assert.match(done.err, /^tab-recap needs Bun >= 1\.4\.4, but this is node v24\.21\.0 \(\/n\/node\)\./);
        assert.equal(done.out, '');
    });

    test('the Host adapter names the OS family: darwin gets the macOS steps, linux and an unknown OS the Linux ones', { timeout: 30_000 }, async () => {
        const darwin = await launched('command', processOn('darwin'), ['refresh']);
        const linux = await launched('command', processOn('linux'), ['refresh']);
        const other = await launched('command', processOn('freebsd'), ['refresh']);
        assert.match(darwin.err, /brew install oven-sh\/bun\/bun[\s\S]*launchctl setenv PATH/);
        assert.doesNotMatch(linux.err, /brew|launchctl/);
        assert.equal(other.err, linux.err);
    });

    test('the steps follow the OS: macOS has brew and the launcher PATH, Linux has neither', { timeout: 30_000 }, async () => {
        const mac = await launched('command', hostOf(OLD), ['refresh']);
        assert.match(mac.err, /brew install oven-sh\/bun\/bun · mise use -g bun@latest · curl -fsSL https:\/\/bun\.sh\/install \| bash/);
        assert.match(mac.err, /herdr server stop[\s\S]*launchctl setenv PATH/);
        const linux = await launched('command', hostOf(LINUX), ['refresh']);
        assert.match(linux.err, /curl -fsSL https:\/\/bun\.sh\/install \| bash · mise use -g bun@latest/);
        assert.doesNotMatch(linux.err, /brew|launchctl/);
        assert.match(linux.err, /\n  2\. Run: herdr server stop\n  3\. Open a new terminal, check that `bun --version` prints 1\.4\.4 or newer/);
    });

    test('the English refusal is the fallback text word for word, for both platforms', { timeout: 30_000 }, async () => {
        for (const host of [OLD, LINUX]) {
            const refusal = supportOf({ bunVersion: host.bunVersion, platform: host.platform });
            const done = await launched('command', hostOf(host), ['refresh']);
            assert.equal(refusal.ok ? null : done.err, refusal.ok ? null : `${renderRefusal(refusal, host.execPath)}\n`);
            assert.equal(refusal.ok, false);
        }
    });

    test('`status` goes on: it loads the entry on a Bun that is too old and reports itself', { timeout: 30_000 }, async () => {
        const done = await launched('command', hostOf(OLD), ['status']);
        assert.deepEqual([done.code, done.out, done.err], [0, 'entry ran\n', '']);
    });

    test('the daemon stops with one dated line on stderr and exit 1', { timeout: 30_000 }, async () => {
        const done = await launched('daemon', hostOf(LINUX));
        assert.equal(done.code, 1);
        assert.match(done.err, /^\d{4}-\d\d-\d\dT[\d:.]+Z tab-recap needs Bun >= 1\.4\.4, but this is 1\.0\.0/);
        assert.match(done.err, /curl -fsSL https:\/\/bun\.sh\/install \| bash · mise use -g bun@latest/);
        assert.equal(done.err.split('\n').filter((line) => /^\d{4}-/.test(line)).length, 1);
        assert.equal(done.out, '');
    });

    test('the refusal follows the interface language, with the same steps, for command and daemon', { timeout: 30_000 }, async () => {
        const english = await launched('command', hostOf(OLD), ['refresh']);
        const spanish = await launched('command', hostOf(OLD), ['refresh'], 'es');
        assert.equal(spanish.code, 1);
        assert.match(spanish.err, /^tab-recap necesita Bun >= 1\.4\.4, pero este es 1\.0\.0 \(\/old\/bin\/bun\)\.\nPara arreglarlo:\n  1\. Instala Bun >= 1\.4\.4 \(/);
        assert.match(spanish.err, /launchctl setenv PATH/);
        assert.equal(spanish.err.split('\n').length, english.err.split('\n').length);
        const daemon = await launched('daemon', hostOf(LINUX), [], 'es');
        assert.match(daemon.err, /Z tab-recap necesita Bun >= 1\.4\.4, pero este es 1\.0\.0/);
        assert.doesNotMatch(daemon.err, /brew|launchctl/);
    });

    test('a pane shows the refusal drawn for a terminal, stays until SIGTERM, then leaves quietly with exit 0', { timeout: 30_000 }, async () => {
        const script = `import { launch } from ${JSON.stringify(LAUNCH)}; await launch('pane', ${JSON.stringify(ENTRY)}, { host: ${hostOf(OLD)} });`;
        const child = spawn(process.execPath, ['-e', script], { env: envOf('en'), stdio: ['ignore', 'pipe', 'pipe'] });
        try {
            let out = '';
            let err = '';
            child.stdout.setEncoding('utf8').on('data', (chunk: string) => { out += chunk; });
            child.stderr.setEncoding('utf8').on('data', (chunk: string) => { err += chunk; });
            const exited = new Promise<number | null>((resolve) => { child.on('exit', resolve); });
            for (let waited = 0; !out.includes('herdr server stop') && waited < 15_000; waited += 25) {
                await nap(25);
            }
            assert.match(out, /needs Bun >= 1\.4\.4, but this is 1\.0\.0/);
            assert.match(out, /\r\n/);
            assert.doesNotMatch(out, /entry ran/);
            assert.equal(child.exitCode, null, 'it stays');
            assert.equal(err, '');
            child.kill('SIGTERM');
            assert.equal(await exited, 0);
        } finally {
            child.kill('SIGKILL');
        }
    });
});

describe('the commands the manifest launches, run as the manifest says', () => {
    let world: EvalWorld;
    const manifest = readFileSync(join(PLUGIN, 'herdr-plugin.toml'), 'utf8');
    const commands = [...manifest.matchAll(/^command = \[(.*)\]$/gm)].map((found) => [...(found[1] ?? '').matchAll(/"([^"]*)"/g)].map((word) => word[1] ?? ''));

    before(() => {
        world = evalWorld({ judge: 'none' });
    });

    after(() => {
        world.close();
    });

    test('every command is bun and a script, never a flag first, and every script is a file of the plugin', { timeout: 30_000 }, () => {
        assert.ok(commands.length >= 14);
        for (const command of commands) {
            assert.equal(command[0], 'bun', command.join(' '));
            assert.match(command[1] ?? '', /^[^-]/, `a flag leads: ${command.join(' ')}`);
        }
        for (const command of commands.filter((one) => one[1] !== 'install')) {
            assert.ok(readFileSync(join(PLUGIN, command[1] ?? '')).length > 0, command.join(' '));
        }
    });

    test('the commands that do not start anything run to their own answer: status says itself, the tab commands say no tab', { timeout: 30_000 }, async () => {
        const expected: Readonly<Record<string, number>> = { status: 0, refresh: 3, column: 3, compact: 3, show: 3 };
        const ran: string[] = [];
        for (const command of commands.filter((one) => one[1] === 'bin/tab-recap.mjs' && expected[one[2] ?? ''] !== undefined)) {
            const result = await world.run(command.slice(2), { script: join(PLUGIN, command[1] ?? '') });
            assert.equal(result.code, expected[command[2] ?? ''], `${command.join(' ')}: ${result.stderr}`);
            ran.push(command[2] ?? '');
        }
        assert.deepEqual(ran.toSorted(), ['column', 'compact', 'refresh', 'show', 'status']);
    });
});

describe('the daemon a command spawns', () => {
    let world: DaemonWorld;

    before(async () => {
        world = await daemonWorld();
    });

    after(async () => {
        await world.close();
    });

    test('start launches it as the Bun that ran the command and its launcher alone, with no flag and no warning switch', { timeout: 30_000, skip: !existsSync('/proc/self/cmdline') }, async () => {
        const started = await world.command('start');
        assert.equal(started.code, 0, started.stderr);
        await world.awaitLog(/daemon \d+ up, state in /);
        const pid = Number(world.pidfile().pid);
        const words = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter((word) => word !== '');
        assert.equal(words.length, 2);
        assert.equal(words[0], process.execPath);
        assert.equal(words[1], join(PLUGIN, 'src', 'daemon', 'launch.mjs'));
        const environment = readFileSync(`/proc/${pid}/environ`, 'utf8');
        assert.doesNotMatch(environment, /disable-warning/);
    });
});
