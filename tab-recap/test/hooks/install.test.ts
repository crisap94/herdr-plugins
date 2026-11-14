import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCurlVersion, renderCurlShim } from '@stateforge-labs/harness-hooks';
import { claudeSettings } from '#src/adapters/hooks/claude-settings.ts';
import { must } from '#src/protocol/result.ts';
import { parseFsPath, type FsPath } from '#src/recap/domain/fs-path.ts';
import { NO, YES } from '#src/recap/domain/gui-tab-parts.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { installHooks, systemInstallIo, uninstallHooks, type InstallIo } from '#src/adapters/hooks/install.ts';
import { HOOK_LIMITS } from '#src/wire/hooks/contract.ts';
import { hookShimPath, hooksSocketPath } from '#src/wire/paths.ts';
import { hookFixture, readHookCases, runShim } from '#test/contracts/wire/fakes/fake-harness.ts';
import { startFakeHookEndpoint, type FakeHookBehaviour } from '#test/contracts/wire/fakes/fake-hook-endpoint.ts';

const SAMPLE = new URL('./fixtures/claude-settings.sample.json', import.meta.url);
const PLUGIN_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const EVENTS = ['Stop', 'SessionStart', 'PreCompact'];
const SLOW_ROW_MS = 20_000;
const BEHAVIOURS: readonly FakeHookBehaviour[] = ['absent', 'refuses', 'status-500', 'status-403', 'body-text', 'slow'];

const curlVersion = (): string | undefined => {
    const probe = spawnSync('curl', ['--version'], { encoding: 'utf8' });
    return probe.status === 0 ? parseCurlVersion(probe.stdout) : undefined;
};

const CURL = curlVersion();

if (CURL === undefined) process.stdout.write('NOT COVERED: no curl\n');

const fsPath = (path: string): FsPath => must(parseFsPath(path));

const curlSays = (text: string): InstallIo => ({ curlVersionText: () => must(parseText(text)) });

const goodCurl = curlSays('curl 8.5.0 (x86_64-pc-linux-gnu) libcurl/8.5.0');

interface Room {
    readonly home: string;
    readonly settingsPath: FsPath;
    readonly stateDir: FsPath;
    readonly otherStateDir: FsPath;
}

async function inRoom(run: (room: Room) => Promise<void> | void): Promise<void> {
    const home = mkdtempSync(join(tmpdir(), 'hooks-install-'));
    const room: Room = { home, settingsPath: fsPath(join(home, '.claude', 'settings.json')), stateDir: fsPath(join(home, 'state')), otherStateDir: fsPath(join(home, 'desktop')) };
    mkdirSync(join(home, '.claude'), { recursive: true });
    copyFileSync(SAMPLE, room.settingsPath);
    try {
        await run(room);
    } finally {
        rmSync(home, { recursive: true, force: true });
    }
}

const read = (path: string): string => readFileSync(path, 'utf8');

const cli = (room: Room, args: readonly string[], switched = 'on'): { status: number | null; stderr: string } => {
    const done = spawnSync(process.execPath, [join(PLUGIN_ROOT, 'bin/tab-recap.ts'), 'hooks', ...args], {
        cwd: PLUGIN_ROOT,
        encoding: 'utf8',
        env: { ...process.env, HOME: room.home, TAB_RECAP_STATE: room.stateDir, HERDR_PLUGIN_CONFIG_DIR: join(room.home, 'config'), TAB_RECAP_LOCALE: 'en', TAB_RECAP_HOOKS: switched },
    });
    return { status: done.status, stderr: done.stderr };
};

test('install, install, uninstall leaves the sample settings file byte-identical and removes hook.sh', async () => {
    await inRoom((room) => {
        const original = read(room.settingsPath);
        const settings = claudeSettings(room.settingsPath);
        assert.deepEqual(installHooks(room.stateDir, settings, goodCurl), { kind: 'done', changed: YES });
        const once = read(room.settingsPath);
        assert.deepEqual(installHooks(room.stateDir, settings, goodCurl), { kind: 'done', changed: NO });
        assert.equal(read(room.settingsPath), once);
        assert.deepEqual(uninstallHooks(room.stateDir, settings), { kind: 'done', changed: YES });
        assert.equal(read(room.settingsPath), original);
        assert.equal(existsSync(hookShimPath(room.stateDir)), false);
    });
});

test('install appends one group per event, keeps the other keys in order, and writes hook.sh with mode 0700', async () => {
    await inRoom((room) => {
        installHooks(room.stateDir, claudeSettings(room.settingsPath), goodCurl);
        const shim = hookShimPath(room.stateDir);
        const json: { hooks: Record<string, unknown[]> } = JSON.parse(read(room.settingsPath));
        assert.deepEqual(Object.keys(json), ['model', 'permissions', 'hooks', 'effortLevel']);
        assert.deepEqual(Object.keys(json.hooks), ['SessionStart', 'Stop', 'PreCompact']);
        assert.equal(json.hooks['SessionStart']?.length, 2);
        for (const event of EVENTS) assert.deepEqual(json.hooks[event]?.at(-1), { hooks: [{ type: 'command', command: `${shim} ${event}` }] }, event);
        assert.equal(statSync(shim).mode & 0o777, 0o700);
        assert.equal(read(shim), renderCurlShim({ harness: 'claude', socketPath: hooksSocketPath(room.stateDir), timeoutMs: HOOK_LIMITS.shimMs, tokenSource: 'none', failClosed: false }));
    });
});

test("a second state directory's entries survive the first's uninstall", async () => {
    await inRoom((room) => {
        const original = read(room.settingsPath);
        const settings = claudeSettings(room.settingsPath);
        installHooks(room.stateDir, settings, goodCurl);
        installHooks(room.otherStateDir, settings, goodCurl);
        uninstallHooks(room.stateDir, settings);
        const text = read(room.settingsPath);
        assert.equal(text.includes(hookShimPath(room.stateDir)), false);
        for (const event of EVENTS) assert.ok(text.includes(`${hookShimPath(room.otherStateDir)} ${event}`), event);
        assert.ok(existsSync(hookShimPath(room.otherStateDir)));
        uninstallHooks(room.otherStateDir, settings);
        assert.equal(read(room.settingsPath), original);
    });
});

test('malformed settings JSON is refused and nothing is written', async () => {
    await inRoom((room) => {
        writeFileSync(room.settingsPath, '{ "hooks": ');
        const result = installHooks(room.stateDir, claudeSettings(room.settingsPath), goodCurl);
        assert.equal(result.kind === 'refused' && result.why, 'malformed');
        assert.equal(read(room.settingsPath), '{ "hooks": ');
        assert.equal(existsSync(hookShimPath(room.stateDir)), false);
    });
});

test('tab-recap hooks install exits 1 on malformed settings JSON and writes nothing', async () => {
    await inRoom((room) => {
        writeFileSync(room.settingsPath, '[1, 2');
        const done = cli(room, ['install']);
        assert.equal(done.status, 1, done.stderr);
        assert.equal(read(room.settingsPath), '[1, 2');
        assert.equal(existsSync(hookShimPath(room.stateDir)), false);
    });
});

test('tab-recap hooks exits 2 on an unknown sub-word or harness', async () => {
    await inRoom((room) => {
        assert.equal(cli(room, ['frobnicate']).status, 2);
        assert.equal(cli(room, ['install', '--harness', 'nobody']).status, 2);
        assert.equal(read(room.settingsPath), read(SAMPLE.pathname));
    });
});

test('tab-recap hooks install then uninstall, switched on, edits ~/.claude/settings.json and restores its bytes', { skip: CURL === undefined }, async () => {
    await inRoom((room) => {
        const original = read(room.settingsPath);
        const installed = cli(room, ['install']);
        assert.equal(installed.status, 0, installed.stderr);
        assert.ok(read(room.settingsPath).includes(`${hookShimPath(room.stateDir)} Stop`));
        const removed = cli(room, ['uninstall', '--harness', 'claude']);
        assert.equal(removed.status, 0, removed.stderr);
        assert.equal(read(room.settingsPath), original);
    });
});

test('tab-recap hooks install stays dark while TAB_RECAP_HOOKS is not on: exit 3, nothing written', async () => {
    await inRoom((room) => {
        const done = cli(room, ['install'], '');
        assert.equal(done.status, 3, done.stderr);
        assert.equal(done.stderr, 'tab-recap: 3 — hooks: not available\n');
        assert.equal(read(room.settingsPath), read(SAMPLE.pathname));
        assert.equal(existsSync(hookShimPath(room.stateDir)), false);
    });
});

test('curl missing or older than 7.55.0 is refused and nothing is written', async () => {
    const cases: readonly (readonly [InstallIo, string])[] = [
        [{ curlVersionText: () => null }, 'curl-missing'],
        [curlSays('curl 7.54.0 (x86_64-pc-linux-gnu) libcurl/7.54.0'), 'curl-old'],
    ];
    for (const [io, why] of cases) {
        await inRoom((room) => {
            const result = installHooks(room.stateDir, claudeSettings(room.settingsPath), io);
            assert.equal(result.kind === 'refused' && result.why, why);
            assert.equal(read(room.settingsPath), read(SAMPLE.pathname));
            assert.equal(existsSync(hookShimPath(room.stateDir)), false);
        });
    }
});

test('the installed hook.sh prints {} and exits 0 for every row of shim-failures.tsv', { skip: CURL === undefined, timeout: SLOW_ROW_MS }, async () => {
    const rows = hookFixture('shim-failures.tsv').split('\n').filter((line) => line.length > 0).slice(1).map((line) => line.split('\t'));
    const request = readHookCases()[0]?.request;
    await inRoom(async (room) => {
        assert.deepEqual(installHooks(room.stateDir, claudeSettings(room.settingsPath), systemInstallIo), { kind: 'done', changed: YES });
        for (const [name, endpoint, stdout, code] of rows) {
            const behaviour = BEHAVIOURS.find((b) => b === endpoint);
            assert.ok(behaviour, `${name}: ${endpoint} is a behaviour of the fake endpoint`);
            const fake = await startFakeHookEndpoint(hooksSocketPath(room.stateDir), behaviour);
            try {
                assert.deepEqual(await runShim(hookShimPath(room.stateDir), 'Stop', request), { stdout: `${stdout}\n`, code: Number(code) }, name);
            } finally {
                await fake.stop();
            }
        }
    });
});

test('the installed hook.sh prints the reply of K5-session-start-compact-restore from the fake endpoint', { skip: CURL === undefined }, async () => {
    const restore = readHookCases().find((c) => c.name === 'K5-session-start-compact-restore');
    assert.ok(restore);
    await inRoom(async (room) => {
        installHooks(room.stateDir, claudeSettings(room.settingsPath), systemInstallIo);
        const fake = await startFakeHookEndpoint(hooksSocketPath(room.stateDir), 'reply-from-cases');
        try {
            assert.deepEqual(await runShim(hookShimPath(room.stateDir), restore.event, restore.request), { stdout: `${JSON.stringify(restore.reply)}\n`, code: 0 });
            assert.deepEqual(fake.requests, [{ path: '/hook/claude', body: restore.request }]);
        } finally {
            await fake.stop();
        }
    });
});
