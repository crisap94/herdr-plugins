import { spawn } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pidfile } from '#src/adapters/os/pidfile.ts';
import { messagesOf, stateDir } from '#src/daemon/config.ts';

const OK = 0;
const WEDGED_MS = 180_000;
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const LAUNCHER = join(root, 'src', 'daemon', 'launch-desktop.mjs');

export function startDesktopDaemon(): number {
    const pidfile = new Pidfile(stateDir());
    const t = messagesOf().cli;
    let running = pidfile.alive();
    if (running !== null && pidfile.wedged(WEDGED_MS)) {
        process.kill(running, 'SIGKILL');
        pidfile.release(running);
        running = null;
    }
    if (running !== null) {
        console.log(`tab-recap: ${t.daemonRunning(running)}`);
        return OK;
    }
    mkdirSync(stateDir(), { recursive: true });
    const out = openSync(pidfile.logPath, 'a');
    const child = spawn(process.execPath, [LAUNCHER], { cwd: root, detached: true, stdio: ['ignore', out, out], env: { ...process.env, TAB_RECAP_STATE: stateDir() } });
    child.unref();
    console.log(`tab-recap: ${t.daemonStarted(String(child.pid ?? '?'), pidfile.logPath)}`);
    return OK;
}

export function stopDesktopDaemon(): number {
    const pidfile = new Pidfile(stateDir());
    pidfile.disabled = true;
    const running = pidfile.alive();
    if (running === null) {
        console.log(`tab-recap: ${messagesOf().cli.offIdle}`);
        return OK;
    }
    process.kill(running, 'SIGTERM');
    console.log(`tab-recap: ${messagesOf().cli.offClosing(running)}`);
    return OK;
}

export function ensureDesktopDaemon(): number {
    const pidfile = new Pidfile(stateDir());
    return pidfile.disabled || pidfile.alive() !== null ? OK : startDesktopDaemon();
}

export function enableDesktopDaemon(): number {
    new Pidfile(stateDir()).disabled = false;
    return startDesktopDaemon();
}
