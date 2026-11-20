import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { writeAtomically } from '#src/adapters/os/atomic-file.ts';

export const STOP_WAIT_MS = 30_000;
export const STOP_POLL_MS = 250;

export type Alive = (pid: number) => boolean;

export const processAlive: Alive = (pid) => {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};

const markerOf = (root: string): string => join(root, 'daemon.stopping');

export function markStopping(root: string, pid: number): void {
    writeAtomically(markerOf(root), `${pid}\n`);
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
