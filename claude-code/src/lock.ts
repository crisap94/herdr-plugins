import { closeSync, linkSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

export const LOCK_DIR = 'locks';
export const DEFAULT_MAX_HOLD_MS = 20 * 60 * 1000;
export const UNWRITTEN_GRACE_MS = 5000;
const TAKE_ATTEMPTS = 3;

export interface Holder {
    readonly pid: number;
    readonly since: number;
    readonly token: string;
}

export interface LockPlugs {
    readonly dir: string;
    readonly pid: number;
    readonly now: () => number;
    readonly alive: (pid: number) => boolean;
    readonly maxHoldMs: number;
}

export type Taken =
    | { readonly kind: 'taken'; readonly holder: Holder; readonly stole: Holder | null; release(): void }
    | { readonly kind: 'held'; readonly by: Holder | null };

type Seen =
    | { readonly kind: 'holder'; readonly holder: Holder; readonly text: string }
    | { readonly kind: 'unwritten'; readonly at: number; readonly text: string }
    | { readonly kind: 'gone' };

const codeOf = (error: unknown): string | undefined => (error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined);

export function processAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return codeOf(error) === 'EPERM';
    }
}

export const lockKeyOf = (session: string): string => encodeURIComponent(session).replaceAll('.', '%2E');

function holderOf(text: string): Holder | null {
    try {
        const parsed: unknown = JSON.parse(text);
        if (typeof parsed !== 'object' || parsed === null) {
            return null;
        }
        const { pid, since, token } = parsed as Record<string, unknown>;
        return typeof pid === 'number' && typeof since === 'number' && typeof token === 'string' ? { pid, since, token } : null;
    } catch {
        return null;
    }
}

function readIfThere(path: string): string | null {
    try {
        return readFileSync(path, 'utf8');
    } catch (error) {
        if (codeOf(error) === 'ENOENT') {
            return null;
        }
        throw error;
    }
}

function removeIfThere(path: string): boolean {
    try {
        unlinkSync(path);
        return true;
    } catch (error) {
        if (codeOf(error) === 'ENOENT') {
            return false;
        }
        throw error;
    }
}

export class SessionLock {
    readonly path: string;
    readonly dirtyPath: string;
    private readonly plugs: LockPlugs;

    constructor(session: string, plugs: LockPlugs) {
        const key = lockKeyOf(session);
        this.path = join(plugs.dir, `${key}.lock`);
        this.dirtyPath = join(plugs.dir, `${key}.dirty`);
        this.plugs = plugs;
    }

    take(): Taken {
        mkdirSync(this.plugs.dir, { recursive: true });
        let stole: Holder | null = null;
        for (let attempt = 0; attempt < TAKE_ATTEMPTS; attempt += 1) {
            const created = this.create();
            if (created !== null) {
                return { kind: 'taken', holder: created.holder, stole, release: (): void => { this.release(created.text); } };
            }
            const seen = this.seen();
            if (seen.kind === 'gone') {
                continue;
            }
            if (!this.stale(seen)) {
                return { kind: 'held', by: seen.kind === 'holder' ? seen.holder : null };
            }
            if (!this.steal(seen.text)) {
                return { kind: 'held', by: null };
            }
            stole = seen.kind === 'holder' ? seen.holder : null;
        }
        return { kind: 'held', by: null };
    }

    markDirty(): void {
        mkdirSync(this.plugs.dir, { recursive: true });
        writeFileSync(this.dirtyPath, String(this.plugs.now()));
    }

    isDirty(): boolean {
        return readIfThere(this.dirtyPath) !== null;
    }

    takeDirty(): boolean {
        return removeIfThere(this.dirtyPath);
    }

    private create(): { readonly holder: Holder; readonly text: string } | null {
        const holder: Holder = { pid: this.plugs.pid, since: this.plugs.now(), token: randomUUID() };
        const text = JSON.stringify(holder);
        let fd: number;
        try {
            fd = openSync(this.path, 'wx');
        } catch (error) {
            if (codeOf(error) === 'EEXIST') {
                return null;
            }
            throw error;
        }
        try {
            writeSync(fd, text);
        } finally {
            closeSync(fd);
        }
        return { holder, text };
    }

    private seen(): Seen {
        const text = readIfThere(this.path);
        if (text === null) {
            return { kind: 'gone' };
        }
        const holder = holderOf(text);
        if (holder !== null) {
            return { kind: 'holder', holder, text };
        }
        try {
            return { kind: 'unwritten', at: statSync(this.path).mtimeMs, text };
        } catch (error) {
            if (codeOf(error) === 'ENOENT') {
                return { kind: 'gone' };
            }
            throw error;
        }
    }

    private stale(seen: Exclude<Seen, { readonly kind: 'gone' }>): boolean {
        const now = this.plugs.now();
        if (seen.kind === 'unwritten') {
            return now - seen.at > UNWRITTEN_GRACE_MS;
        }
        return !this.plugs.alive(seen.holder.pid) || now - seen.holder.since > this.plugs.maxHoldMs;
    }

    private steal(expected: string): boolean {
        const tomb = `${this.path}.stale-${randomUUID()}`;
        try {
            renameSync(this.path, tomb);
        } catch (error) {
            if (codeOf(error) === 'ENOENT') {
                return true;
            }
            throw error;
        }
        const moved = readIfThere(tomb);
        if (moved === expected) {
            removeIfThere(tomb);
            return true;
        }
        try {
            linkSync(tomb, this.path);
        } catch (error) {
            if (codeOf(error) !== 'EEXIST') {
                throw error;
            }
        }
        removeIfThere(tomb);
        return false;
    }

    private release(text: string): void {
        if (readIfThere(this.path) === text) {
            removeIfThere(this.path);
        }
    }
}
