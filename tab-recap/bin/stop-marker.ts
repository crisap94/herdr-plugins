import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fsPathOf } from '#src/recap/domain/fs-path.ts';
import { textOf } from '@stateforge-labs/session-ledger';
import { writeAtomically } from '#src/adapters/os/atomic-file.ts';

export const STOP_WAIT_MS = 30_000;
export const STOP_POLL_MS = 250;

export type Alive = (pid: number) => boolean;

const running = (pid: number): boolean => {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};

export function isDaemonCommand(command: string): boolean {
    return /daemon[\\/]launch\.mjs/.test(command);
}

const commandOf = (pid: number): string => {
    try {
        return readFileSync(`/proc/${pid}/cmdline`, 'utf8').replaceAll('\0', ' ');
    } catch {
        const ps = spawnSync('ps', ['-p', String(pid), '-o', 'args='], { encoding: 'utf8' });
        return ps.status === 0 ? ps.stdout : '';
    }
};

export const processAlive: Alive = (pid) => running(pid) && isDaemonCommand(commandOf(pid));

const markerOf = (root: string): string => join(root, 'daemon.stopping');

export function markStopping(root: string, pid: number): void {
    writeAtomically(fsPathOf(markerOf(root)), textOf(`${pid}\n`));
}

export function stoppingPid(root: string, alive: Alive): number | null {
    let pid = 0;
    try { pid = Number(readFileSync(markerOf(root), 'utf8').trim()); } catch { return null; }
    if (!Number.isInteger(pid) || pid <= 0) {
        return null;
    }
    if (alive(pid)) {
        return pid;
    }
    rmSync(markerOf(root), { force: true });
    return null;
}

export async function stillStopping(root: string, alive: Alive = processAlive, sleep: (ms: number) => Promise<unknown> = delay, now: () => number = Date.now): Promise<boolean> {
    const started = now();
    for (;;) {
        if (stoppingPid(root, alive) === null) {
            return false;
        }
        if (now() - started >= STOP_WAIT_MS) {
            return true;
        }
        await sleep(STOP_POLL_MS);
    }
}
