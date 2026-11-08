import { chmodSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Count } from '#src/recap/domain/count.ts';
import type { Directory } from '#src/recap/domain/directory.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { NonEmptyText } from '#src/recap/domain/text.ts';
import { API_FILE, API_VERSION } from './desktop-constants.ts';

export interface Discovery {
    readonly port: Count;
    readonly token: NonEmptyText;
    readonly startedAt: Instant;
}

const OWNER_ONLY = 0o600;

export function writeDiscovery(dir: Directory, found: Discovery): void {
    const path = join(dir, API_FILE);
    const temporary = `${path}.${process.pid}.tmp`;
    mkdirSync(dir, { recursive: true });
    rmSync(temporary, { force: true });
    writeFileSync(temporary, JSON.stringify({ version: API_VERSION, port: found.port, token: found.token, pid: process.pid, startedAt: found.startedAt }), { mode: OWNER_ONLY });
    chmodSync(temporary, OWNER_ONLY);
    renameSync(temporary, path);
}

export function removeDiscovery(dir: Directory, token: NonEmptyText): void {
    const path = join(dir, API_FILE);
    try {
        const current: unknown = JSON.parse(readFileSync(path, 'utf8'));
        const ours = typeof current === 'object' && current !== null && 'token' in current && current.token === token;
        if (ours) { rmSync(path, { force: true }); }
    } catch {
        return;
    }
}
