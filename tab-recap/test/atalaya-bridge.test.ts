import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AtalayaBridge, atalayaBridge, userBusEnv } from '#src/extensions/atalaya-bridge.ts';
import type { Runner } from '#src/extensions/atalaya-bridge.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { parseDirectory, type Directory } from '#src/recap/domain/directory.ts';
import { instant } from '#src/recap/domain/time.ts';

const NOW = 10_000_000;
const alert = (pane: string, kind: string, at: number, evidence: object): string => JSON.stringify({ at, episode: { pane, kind }, evidence });

function fixture(files: Readonly<Record<string, string>>): { dir: Directory; done: () => void } {
    const dir = mkdtempSync(join(tmpdir(), 'recap-bridge-'));
    for (const [name, text] of Object.entries(files)) {
        writeFileSync(join(dir, name), text);
    }
    return { dir: must(parseDirectory(dir)), done: (): void => { rmSync(dir, { recursive: true }); } };
}

function recorder(codes: Readonly<Record<string, number>> = {}): { runner: Runner; calls: string[]; envs: NodeJS.ProcessEnv[] } {
    const calls: string[] = [];
    const envs: NodeJS.ProcessEnv[] = [];
    const runner: Runner = (command, args, options) => {
        envs.push(options.env);
        calls.push([command, ...args].join(' '));
        return Promise.resolve({ code: codes[args[1] ?? ''] ?? 0, stdout: '', stderr: 'boom', timedOut: false });
    };
    return { runner, calls, envs };
}

const noKeys = (): 'on' => 'on';
const off = (): 'off' => 'off';

test('notes: the latest alert per pane becomes a Note — kind, time, branch · N unmerged · tree', () => {
    const { dir, done } = fixture({
        'atalaya-log.jsonl': [
            alert('w1:p1', 'blocked', 1, { branch: 'old' }),
            alert('w1:p1', 'idle', 5000, { branch: 'main', unmerged: 2, tree: 'dirty' }),
            alert('w1:p2', 'done', 7, {}),
            'not json',
            JSON.stringify({ episode: { pane: 'w1:p3' } }),
        ].join('\n'),
    });
    try {
        const result = new AtalayaBridge(dir, noKeys).notes();
        assert.ok(result.kind === 'notes');
        assert.deepEqual(result.byPane.get('w1:p1'), [{ label: 'idle', at: 5000, details: ['main', '2 unmerged', 'dirty'] }]);
        assert.deepEqual(result.byPane.get('w1:p2'), [{ label: 'done', at: 7, details: [] }]);
        assert.equal(result.byPane.has('w1:p3'), false);
    } finally {
        done();
    }
});

test('notes: a missing outbox is an Unknown, not a throw', () => {
    const { dir, done } = fixture({});
    try {
        assert.ok(isUnknown(new AtalayaBridge(dir, noKeys).notes()));
    } finally {
        done();
    }
});

test('warning: silent until the heartbeat is 3 minutes old; then en and es say how long', () => {
    const fresh = fixture({ heartbeat: String(NOW - 60_000) });
    const stale = fixture({ heartbeat: String(NOW - 240_000) });
    const none = fixture({});
    try {
        assert.equal(new AtalayaBridge(fresh.dir, noKeys, recorder().runner, () => instant(NOW)).warning('en'), null);
        const bridge = new AtalayaBridge(stale.dir, noKeys, recorder().runner, () => instant(NOW));
        assert.equal(bridge.warning('en'), 'atalaya-bridge silent for 4 min — healing');
        assert.equal(bridge.warning('es'), 'atalaya-bridge sin señal desde hace 4 min — intentando arrancarlo');
        assert.equal(new AtalayaBridge(none.dir, noKeys, recorder().runner, () => instant(NOW)).warning('en'), null, 'no heartbeat file: nothing to say');
    } finally {
        [fresh, stale, none].forEach((item) => { item.done(); });
    }
});

test('the factory: null when the directory is absent or the setting is empty; an extension when it exists', () => {
    const { dir, done } = fixture({});
    try {
        assert.equal(atalayaBridge((key) => (key === 'TAB_RECAP_BRIDGE_DIR' ? join(dir, 'nope') : undefined)), null);
        assert.equal(atalayaBridge((key) => (key === 'TAB_RECAP_BRIDGE_DIR' ? '' : undefined)), null);
        assert.equal(atalayaBridge((key) => (key === 'TAB_RECAP_BRIDGE_DIR' ? join(dir, 'atalaya-log.jsonl') : undefined)), null);
        assert.equal(atalayaBridge((key) => (key === 'TAB_RECAP_BRIDGE_DIR' ? dir : undefined))?.id, 'atalaya-bridge');
    } finally {
        done();
    }
});

test('heal: gated by the heartbeat, the switch and the rate limit — and never calls systemctl otherwise', async () => {
    const stale = fixture({ heartbeat: String(NOW - 240_000) });
    const fresh = fixture({ heartbeat: String(NOW - 1000) });
    const none = fixture({});
    try {
        const idle = recorder();
        assert.deepEqual(await new AtalayaBridge(fresh.dir, noKeys, idle.runner, () => instant(NOW)).upkeep(), { kind: 'idle' });
        assert.deepEqual(await new AtalayaBridge(none.dir, noKeys, idle.runner, () => instant(NOW)).upkeep(), { kind: 'idle' });
        assert.deepEqual(await new AtalayaBridge(stale.dir, off, idle.runner, () => instant(NOW)).upkeep(), { kind: 'idle' });
        assert.deepEqual(idle.calls, [], 'no systemctl in any of those');

        const running = recorder({ 'is-active': 0 });
        assert.deepEqual(await new AtalayaBridge(stale.dir, noKeys, running.runner, () => instant(NOW)).upkeep(), { kind: 'idle' });
        assert.deepEqual(running.calls, ['systemctl --user is-active --quiet atalaya-bridge.service'], 'a running unit is never restarted');

        const down = recorder({ 'is-active': 3, start: 0 });
        let now = NOW;
        const bridge = new AtalayaBridge(stale.dir, noKeys, down.runner, () => instant(now));
        assert.deepEqual(await bridge.upkeep(), { kind: 'acted', saying: 'atalaya-bridge.service was down: started it' });
        assert.deepEqual(down.calls.at(-1), 'systemctl --user start atalaya-bridge.service');
        now += 60_000;
        const before = down.calls.length;
        assert.deepEqual(await bridge.upkeep(), { kind: 'idle' });
        assert.equal(down.calls.length, before, 'rate-limited: not again within 5 minutes');

        const failing = recorder({ 'is-active': 3, start: 1 });
        const result = await new AtalayaBridge(stale.dir, noKeys, failing.runner, () => instant(NOW)).upkeep();
        assert.ok(isUnknown(result) && result.why.why === 'failed');
    } finally {
        [stale, fresh, none].forEach((item) => { item.done(); });
    }
});

test('heal: systemctl --user gets the user session bus in its environment when the daemon was started without it', async () => {
    const stale = fixture({ heartbeat: String(NOW - 240_000) });
    try {
        const down = recorder({ 'is-active': 3, start: 0 });
        await new AtalayaBridge(stale.dir, noKeys, down.runner, () => instant(NOW), { PATH: '/usr/bin' }).upkeep();
        const uid = process.getuid?.();
        assert.equal(down.envs.length, 2, 'both is-active and start');
        for (const env of down.envs) {
            assert.equal(env['XDG_RUNTIME_DIR'], `/run/user/${String(uid)}`);
            assert.equal(env['DBUS_SESSION_BUS_ADDRESS'], `unix:path=/run/user/${String(uid)}/bus`);
            assert.equal(env['PATH'], '/usr/bin', 'the rest of the environment is kept');
        }
    } finally {
        stale.done();
    }
});

test('userBusEnv: values that are already set are kept, empty ones are filled, no uid changes nothing', () => {
    assert.deepEqual(userBusEnv({ XDG_RUNTIME_DIR: '/custom', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/custom/bus' }, must(parseCount(1000))), { XDG_RUNTIME_DIR: '/custom', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/custom/bus' });
    assert.deepEqual(userBusEnv({ XDG_RUNTIME_DIR: '' }, must(parseCount(1000))), { XDG_RUNTIME_DIR: '/run/user/1000', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus' });
    assert.deepEqual(userBusEnv({ A: '1' }, undefined), { A: '1' });
});
