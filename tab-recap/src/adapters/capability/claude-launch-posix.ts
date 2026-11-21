import { readFileSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { parseCount } from '#src/recap/domain/count.ts';
import type { Count } from '#src/recap/domain/count.ts';
import { parseFsPath } from '#src/recap/domain/fs-path.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import { parseSessionId } from '#src/recap/domain/ids.ts';
import type { SessionId } from '#src/recap/domain/ids.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { ClaudeLaunch, ClaudeLaunchEnv, ClaudeLaunches } from '#src/ports/claude-launch.ts';
import { COMPACT_PERCENT_KEY, COMPACT_WINDOW_KEY, parseCompactPercentEnv, parseCompactWindowEnv } from './claude-compact-env.ts';

const SETTINGS_FLAG = '--settings';
const STARTTIME_AFTER_COMMAND = 19;
const REMEMBERED = 64;
const NUL = '\u0000';

export interface ClaudeLaunchPaths {
    readonly home: FsPath;
    readonly proc: FsPath;
}

export interface SessionFile {
    readonly session: SessionId;
    readonly pid: Count;
    readonly procStart: Text;
    readonly cwd: SessionCwd | null;
}

type ProcFile = 'environ' | 'cmdline' | 'stat';
type PathPart = FsPath | Text | Count | ProcFile | 'sessions' | '.claude';
type Identity = 'matches' | 'differs';

interface InlineSettings {
    readonly kind: 'inline';
    readonly text: Text;
}

interface FileSettings {
    readonly kind: 'file';
    readonly path: FsPath;
}

type SettingsSource = InlineSettings | FileSettings;

interface Cached {
    readonly env: ClaudeLaunchEnv;
    readonly settings: SettingsSource | null;
}

const pathOf = (...segments: readonly PathPart[]): FsPath | null => {
    const path = parseFsPath(join(...segments.map((segment) => String(segment))));
    return path.kind === 'ok' ? path.value : null;
};

const readText = (file: FsPath | null): Text | null => {
    if (file === null) {
        return null;
    }
    try {
        const text = parseText(readFileSync(file, 'utf8'));
        return text.kind === 'ok' ? text.value : null;
    } catch {
        return null;
    }
};

const entriesOf = (raw: Text): Text[] => raw.split(NUL).flatMap((part) => {
    const text = parseText(part);
    return text.kind === 'ok' ? [text.value] : [];
});

const environLimits = (entries: readonly Text[]): ClaudeLaunchEnv => {
    let window: Count | null = null;
    let percent: Count | null = null;
    for (const entry of entries) {
        if (entry.startsWith(`${COMPACT_WINDOW_KEY}=`)) {
            window = parseCompactWindowEnv(entry.slice(COMPACT_WINDOW_KEY.length + 1));
        }
        if (entry.startsWith(`${COMPACT_PERCENT_KEY}=`)) {
            percent = parseCompactPercentEnv(entry.slice(COMPACT_PERCENT_KEY.length + 1));
        }
    }
    return { window, percent };
};

const valueAfterFlag = (arg: Text): Text | null => {
    const value = parseText(arg.slice(SETTINGS_FLAG.length + 1));
    return value.kind === 'ok' ? value.value : null;
};

const settingsArgumentOf = (args: readonly Text[]): Text | null => {
    let found: Text | null = null;
    for (const [index, arg] of args.entries()) {
        if (arg === SETTINGS_FLAG) {
            found = args[index + 1] ?? found;
        } else if (arg.startsWith(`${SETTINGS_FLAG}=`)) {
            found = valueAfterFlag(arg) ?? found;
        }
    }
    return found;
};

const fileNamed = (value: Text, cwd: FsPath | null): FsPath | null => {
    if (isAbsolute(value)) {
        return pathOf(value);
    }
    return cwd === null ? null : pathOf(cwd, value);
};

const sourceOf = (value: Text, cwd: FsPath | null): SettingsSource | null => {
    if (value.startsWith('{')) {
        return { kind: 'inline', text: value };
    }
    const path = fileNamed(value, cwd);
    return path === null ? null : { kind: 'file', path };
};

const readSettings = (source: SettingsSource | null): Text | null => {
    if (source === null) {
        return null;
    }
    return source.kind === 'inline' ? source.text : readText(source.path);
};

export type SessionCwd = FsPath;

export function parseSessionCwd(document: unknown): SessionCwd | null {
    if (typeof document !== 'object' || document === null || !('cwd' in document)) {
        return null;
    }
    const cwd = parseFsPath(document.cwd);
    return cwd.kind === 'ok' ? cwd.value : null;
}

export function parseSessionFile(input: unknown): SessionFile | null {
    if (typeof input !== 'object' || input === null) {
        return null;
    }
    const pid = parseCount('pid' in input ? input.pid : undefined);
    const session = parseSessionId('sessionId' in input ? input.sessionId : undefined);
    const procStart = parseText('procStart' in input ? input.procStart : undefined);
    if (pid.kind !== 'ok' || session.kind !== 'ok' || procStart.kind !== 'ok') {
        return null;
    }
    return { session: session.value, pid: pid.value, procStart: procStart.value, cwd: parseSessionCwd(input) };
}

export class ClaudeLaunchPosix implements ClaudeLaunches {
    private readonly paths: ClaudeLaunchPaths;
    private readonly sessions = new Map<SessionId, SessionFile>();
    private readonly cached = new Map<SessionFile, Cached>();
    private listedMark: Text | null = null;

    constructor(paths: ClaudeLaunchPaths) {
        this.paths = paths;
    }

    launchOf(session: SessionId): ClaudeLaunch | null {
        this.relistIfChanged();
        const file = this.sessions.get(session);
        if (file === undefined || this.identityOf(file) !== 'matches') {
            return null;
        }
        const hit = this.cached.get(file) ?? this.read(file);
        return hit === null ? null : { env: hit.env, settings: readSettings(hit.settings) };
    }

    private read(file: SessionFile): Cached | null {
        const environ = readText(this.procFile(file, 'environ'));
        const cmdline = readText(this.procFile(file, 'cmdline'));
        if (environ === null || cmdline === null) {
            return null;
        }
        const launch: Cached = { env: environLimits(entriesOf(environ)), settings: this.settingsOf(cmdline, file) };
        this.cached.set(file, launch);
        if (this.cached.size > REMEMBERED) {
            this.cached.delete(this.cached.keys().next().value ?? file);
        }
        return launch;
    }

    private settingsOf(cmdline: Text, file: SessionFile): SettingsSource | null {
        const value = settingsArgumentOf(entriesOf(cmdline));
        return value === null ? null : sourceOf(value, file.cwd);
    }

    private procFile(file: SessionFile, name: ProcFile): FsPath | null {
        return pathOf(this.paths.proc, file.pid, name);
    }

    private identityOf(file: SessionFile): Identity {
        const raw = readText(this.procFile(file, 'stat'));
        if (raw === null) {
            return 'differs';
        }
        const fields = raw.slice(raw.lastIndexOf(')') + 1).trim().split(/\s+/);
        return fields[STARTTIME_AFTER_COMMAND] === file.procStart ? 'matches' : 'differs';
    }

    private relistIfChanged(): void {
        const dir = pathOf(this.paths.home, '.claude', 'sessions');
        const mark = dir === null ? null : this.markOf(dir);
        if (mark === this.listedMark) {
            return;
        }
        this.listedMark = mark;
        this.sessions.clear();
        if (dir === null || mark === null) {
            return;
        }
        for (const name of this.namesIn(dir)) {
            const file = this.sessionFileAt(dir, name);
            if (file !== null) {
                this.sessions.set(file.session, file);
            }
        }
    }

    private markOf(dir: FsPath): Text | null {
        try {
            const text = parseText(String(statSync(dir).mtimeMs));
            return text.kind === 'ok' ? text.value : null;
        } catch {
            return null;
        }
    }

    private namesIn(dir: FsPath): Text[] {
        try {
            return readdirSync(dir).flatMap((name) => {
                const text = parseText(name);
                return text.kind === 'ok' && name.endsWith('.json') ? [text.value] : [];
            });
        } catch {
            return [];
        }
    }

    private sessionFileAt(dir: FsPath, name: Text): SessionFile | null {
        const raw = readText(pathOf(dir, name));
        if (raw === null) {
            return null;
        }
        let document: unknown;
        try {
            document = JSON.parse(raw);
        } catch {
            return null;
        }
        return parseSessionFile(document);
    }
}
