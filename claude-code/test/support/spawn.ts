import { spawn, spawnSync } from 'node:child_process';

export interface Spawned {
    readonly code: number | null;
    readonly pid: number;
    readonly out: string;
    readonly err: string;
}

export function spawnedNow(args: readonly string[]): Spawned {
    const ran = spawnSync(process.execPath, args, { encoding: 'utf8' });
    return { code: ran.status, pid: ran.pid, out: ran.stdout, err: ran.stderr };
}

export function spawned(args: readonly string[]): Promise<Spawned> {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        let err = '';
        child.stdout.setEncoding('utf8').on('data', (chunk: string) => { out += chunk; });
        child.stderr.setEncoding('utf8').on('data', (chunk: string) => { err += chunk; });
        child.on('error', reject);
        child.on('close', (code) => { resolve({ code, pid: child.pid ?? -1, out, err }); });
    });
}
