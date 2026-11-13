import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lockKeyOf } from './lock.ts';
import type { HookSession } from './payload.ts';

export const SESSIONS_DIR = 'sessions';

export interface SessionNote extends HookSession {
    readonly at: number;
}

const isNote = (found: unknown): found is SessionNote => {
    if (typeof found !== 'object' || found === null) {
        return false;
    }
    const note: Partial<Record<keyof SessionNote, unknown>> = found;
    return typeof note.session === 'string' && typeof note.records === 'string' && typeof note.cwd === 'string' && typeof note.at === 'number';
};

const noteOf = (path: string): SessionNote | null => {
    try {
        const found: unknown = JSON.parse(readFileSync(path, 'utf8'));
        return isNote(found) ? found : null;
    } catch {
        return null;
    }
};

export function noteSession(stateDir: string, hook: HookSession, at: number): void {
    const dir = join(stateDir, SESSIONS_DIR);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `${lockKeyOf(hook.session)}.json`);
    const draft = `${path}.${process.pid}.tmp`;
    const note: SessionNote = { session: hook.session, records: hook.records, cwd: hook.cwd, at };
    writeFileSync(draft, JSON.stringify(note));
    renameSync(draft, path);
}

export function sessionNotes(stateDir: string): readonly SessionNote[] {
    const dir = join(stateDir, SESSIONS_DIR);
    try {
        return readdirSync(dir).filter((name) => name.endsWith('.json')).flatMap((name) => noteOf(join(dir, name)) ?? []);
    } catch {
        return [];
    }
}

export const sessionNamed = (stateDir: string, session: string): SessionNote | null => sessionNotes(stateDir).find((note) => note.session === session) ?? null;

export const newestSessionIn = (stateDir: string, cwd: string): SessionNote | null =>
    sessionNotes(stateDir).filter((note) => note.cwd === cwd).toSorted((a, b) => b.at - a.at)[0] ?? null;
