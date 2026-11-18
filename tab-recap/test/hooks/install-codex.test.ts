import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { codexSettings } from '#src/adapters/hooks/codex-settings.ts';
import { harnessSettings, installHooks, uninstallHooks, type InstallIo } from '#src/adapters/hooks/install.ts';
import { must } from '#src/protocol/result.ts';
import { parseFsPath, type FsPath } from '#src/recap/domain/fs-path.ts';
import { NO, YES } from '#src/recap/domain/gui-tab-parts.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { hookShimPath } from '#src/wire/paths.ts';

const SAMPLE = new URL('./fixtures/codex-settings.sample.json', import.meta.url);
const EVENTS = ['Stop', 'SessionStart', 'PreCompact'];

const fsPath = (path: string): FsPath => must(parseFsPath(path));

const goodCurl: InstallIo = { curlVersionText: () => must(parseText('curl 8.5.0 (x86_64-pc-linux-gnu) libcurl/8.5.0')) };

interface Room {
    readonly home: string;
    readonly settingsPath: FsPath;
    readonly stateDir: FsPath;
    readonly otherStateDir: FsPath;
}

function inRoom(seeded: boolean, run: (room: Room) => void): void {
    const home = mkdtempSync(join(tmpdir(), 'codex-install-'));
    const room: Room = { home, settingsPath: fsPath(join(home, '.codex', 'hooks.json')), stateDir: fsPath(join(home, 'state')), otherStateDir: fsPath(join(home, 'desktop')) };
    mkdirSync(join(home, '.codex'), { recursive: true });
    if (seeded) copyFileSync(SAMPLE, room.settingsPath);
    try {
        run(room);
    } finally {
        rmSync(home, { recursive: true, force: true });
    }
}

const read = (path: string): string => readFileSync(path, 'utf8');

test('install, install, uninstall leaves the codex sample hooks.json byte-identical and removes hook.sh', () => {
    inRoom(true, (room) => {
        const original = read(room.settingsPath);
        const settings = codexSettings(room.settingsPath);
        assert.deepEqual(installHooks(room.stateDir, settings, goodCurl), { kind: 'done', changed: YES });
        const once = read(room.settingsPath);
        assert.deepEqual(installHooks(room.stateDir, settings, goodCurl), { kind: 'done', changed: NO });
        assert.equal(read(room.settingsPath), once);
        assert.deepEqual(uninstallHooks(room.stateDir, settings), { kind: 'done', changed: YES });
        assert.equal(read(room.settingsPath), original);
        assert.equal(existsSync(hookShimPath(room.stateDir, 'codex')), false);
    });
});

test('install keeps the other hooks of the sample and appends one group per event', () => {
    inRoom(true, (room) => {
        installHooks(room.stateDir, codexSettings(room.settingsPath), goodCurl);
        const shim = hookShimPath(room.stateDir, 'codex');
        const json: { hooks: Record<string, { hooks: unknown[] }[]> } = JSON.parse(read(room.settingsPath));
        assert.deepEqual(Object.keys(json.hooks), ['SessionStart', 'UserPromptSubmit', 'Stop', 'PreCompact']);
        assert.equal(json.hooks['SessionStart']?.length, 2);
        assert.equal(json.hooks['UserPromptSubmit']?.length, 1);
        for (const event of EVENTS) assert.deepEqual(json.hooks[event]?.at(-1), { hooks: [{ type: 'command', command: `${shim} ${event}` }] }, event);
    });
});

test("a second state directory's entries survive the first's uninstall", () => {
    inRoom(true, (room) => {
        const original = read(room.settingsPath);
        const settings = codexSettings(room.settingsPath);
        installHooks(room.stateDir, settings, goodCurl);
        installHooks(room.otherStateDir, settings, goodCurl);
        uninstallHooks(room.stateDir, settings);
        const text = read(room.settingsPath);
        assert.equal(text.includes(hookShimPath(room.stateDir, 'codex')), false);
        for (const event of EVENTS) assert.ok(text.includes(`${hookShimPath(room.otherStateDir, 'codex')} ${event}`), event);
        uninstallHooks(room.otherStateDir, settings);
        assert.equal(read(room.settingsPath), original);
    });
});

test('malformed hooks.json is refused and nothing is written', () => {
    inRoom(false, (room) => {
        writeFileSync(room.settingsPath, '{ "hooks": ');
        const result = installHooks(room.stateDir, codexSettings(room.settingsPath), goodCurl);
        assert.equal(result.kind === 'refused' && result.why, 'malformed');
        assert.equal(read(room.settingsPath), '{ "hooks": ');
        assert.equal(existsSync(hookShimPath(room.stateDir, 'codex')), false);
    });
});

test('a missing hooks.json is created with a top-level hooks object that holds only tab-recap hooks', () => {
    inRoom(false, (room) => {
        const settings = codexSettings(room.settingsPath);
        assert.deepEqual(installHooks(room.stateDir, settings, goodCurl), { kind: 'done', changed: YES });
        const json: { hooks: Record<string, unknown[]> } = JSON.parse(read(room.settingsPath));
        assert.deepEqual(Object.keys(json), ['hooks']);
        assert.deepEqual(Object.keys(json.hooks), EVENTS);
        for (const event of EVENTS) assert.deepEqual(json.hooks[event], [{ hooks: [{ type: 'command', command: `${hookShimPath(room.stateDir, 'codex')} ${event}` }] }], event);
    });
});

test('the harness list names codex and points it at ~/.codex/hooks.json without writing to it', () => {
    const found = harnessSettings(must(parseText('codex')));
    assert.deepEqual(found?.map((settings) => [settings.harness, settings.path]), [['codex', join(homedir(), '.codex', 'hooks.json')]]);
});
