import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Count } from '@stateforge-labs/session-ledger';
import type { Directory } from '@stateforge-labs/session-ledger';
import type { Instant } from '@stateforge-labs/session-ledger';
import { fsPathOf } from '#src/recap/domain/fs-path.ts';
import { textOf, type NonEmptyText } from '@stateforge-labs/session-ledger';
import { API_FILE, API_VERSION } from '../constants.ts';
import { writeAtomically } from '../../os/atomic-file.ts';

export interface Discovery {
    readonly port: Count;
    readonly token: NonEmptyText;
    readonly startedAt: Instant;
}

const OWNER_ONLY = 0o600;

export function writeDiscovery(dir: Directory, found: Discovery): void {
    writeAtomically(fsPathOf(join(dir, API_FILE)), textOf(JSON.stringify({ version: API_VERSION, port: found.port, token: found.token, pid: process.pid, startedAt: found.startedAt })), OWNER_ONLY);
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
