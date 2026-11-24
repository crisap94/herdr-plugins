import { readFileSync, statSync } from 'node:fs';
import type { Stats } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { must } from '@stateforge-labs/session-ledger';
import type { ClaudeLaunch, ClaudeLaunchEnv, ClaudeLaunches } from '#src/ports/claude-launch.ts';
import type { CompactLimit, CompactLimits } from '#src/ports/compact-limits.ts';
import { parseCount } from '@stateforge-labs/session-ledger';
import type { Count } from '@stateforge-labs/session-ledger';
import { parseFsPath } from '#src/recap/domain/fs-path.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import type { HarnessKind, SessionId } from '#src/recap/domain/ids.ts';
import { parseText } from '@stateforge-labs/session-ledger';
import type { Text } from '@stateforge-labs/session-ledger';
import type { Directory } from '@stateforge-labs/session-ledger';
import { MIN_CLAUDE_WINDOW, parseCompactPercentEnv, parseCompactWindowEnv } from './claude-compact-env.ts';
import { ClaudeLaunchPosix } from './claude-launch-posix.ts';

const CODEX_LIMIT = /^model_auto_compact_token_limit\s*=\s*(\d+)\s*(?:#.*)?$/;
const SECTION_HEADER = /^\s*\[/;
const MANAGED_SETTINGS = ['/etc/claude-code/managed-settings.json', '/Library/Application Support/ClaudeCode/managed-settings.json'];
const NO_LIMIT: CompactLimit = { window: null, percent: null };
const NO_ENV: ClaudeLaunchEnv = { window: null, percent: null };

export type AutoCompactWindow = Count;

export type ModelWindows = ReadonlyMap<Text, AutoCompactWindow>;

export interface ClaudeSettings {
    readonly top: AutoCompactWindow | null;
    readonly models: ReadonlyMap<Text, AutoCompactWindow>;
    readonly env: ClaudeLaunchEnv;
}

export interface CompactLimitPaths {
    readonly home: FsPath;
    readonly managed: readonly FsPath[];
}

interface Entry<T> {
    readonly mtimeMs: number;
    readonly size: number;
    readonly value: T | null;
}

export function parseAutoCompactWindow(input: unknown): AutoCompactWindow | null {
    const count = parseCount(input);
    return count.kind === 'ok' && count.value >= MIN_CLAUDE_WINDOW ? count.value : null;
}

export function parseModelWindows(input: unknown): ModelWindows {
    const models = new Map<Text, AutoCompactWindow>();
    if (typeof input !== 'object' || input === null) {
        return models;
    }
    const entries: [string, unknown][] = Object.entries(input);
    for (const [name, entry] of entries) {
        const model = parseText(name);
        const window = typeof entry === 'object' && entry !== null && 'autoCompactWindow' in entry ? parseAutoCompactWindow(entry.autoCompactWindow) : null;
        if (model.kind === 'ok' && window !== null) {
            models.set(model.value, window);
        }
    }
    return models;
}

export type ClaudeEnv = ClaudeLaunchEnv;

export function parseClaudeEnv(input: unknown): ClaudeEnv {
    if (typeof input !== 'object' || input === null || !('env' in input) || typeof input.env !== 'object' || input.env === null) {
        return NO_ENV;
    }
    return {
        window: 'CLAUDE_CODE_AUTO_COMPACT_WINDOW' in input.env ? parseCompactWindowEnv(input.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW) : null,
        percent: 'CLAUDE_AUTOCOMPACT_PCT_OVERRIDE' in input.env ? parseCompactPercentEnv(input.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE) : null,
    };
}

export function parseClaudeSettings(input: unknown): ClaudeSettings {
    if (typeof input !== 'object' || input === null) {
        return { top: null, models: new Map<Text, AutoCompactWindow>(), env: NO_ENV };
    }
    return {
        top: 'autoCompactWindow' in input ? parseAutoCompactWindow(input.autoCompactWindow) : null,
        models: parseModelWindows('modelSettings' in input ? input.modelSettings : null),
        env: parseClaudeEnv(input),
    };
}

export function parseClaudeFile(text: Text): ClaudeSettings {
    let document: unknown;
    try {
        document = JSON.parse(text);
    } catch {
        document = null;
    }
    return parseClaudeSettings(document);
}

const codexLimitIn = (text: Text): Count | null => {
    for (const line of text.split(/\r?\n/)) {
        if (SECTION_HEADER.test(line)) {
            return null;
        }
        const match = CODEX_LIMIT.exec(line.trim());
        if (match !== null) {
            const count = parseCount(Number(match[1]));
            return count.kind === 'ok' ? count.value : null;
        }
    }
    return null;
};

const claudeLimitIn = (settings: ClaudeSettings, model: Text | null): AutoCompactWindow | null => {
    const perModel = model === null ? undefined : settings.models.get(model);
    return perModel ?? settings.top;
};

const firstOf = <T>(layers: readonly ClaudeSettings[], pick: (layer: ClaudeSettings) => T | null): T | null => {
    for (const layer of layers) {
        const value = pick(layer);
        if (value !== null) {
            return value;
        }
    }
    return null;
};

const present = <T>(value: T | null): value is T => value !== null;

class ParsedFile<T> {
    private readonly parse: (text: Text) => T;
    private readonly entries = new Map<FsPath, Entry<T>>();

    constructor(parse: (text: Text) => T) {
        this.parse = parse;
    }

    read(file: FsPath): T | null {
        let stat: Stats;
        try {
            stat = statSync(file);
        } catch {
            return null;
        }
        const hit = this.entries.get(file);
        if (hit !== undefined && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) {
            return hit.value;
        }
        const text = this.textOf(file);
        const value = text === null ? null : this.parse(text);
        this.entries.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, value });
        return value;
    }

    private textOf(file: FsPath): Text | null {
        let raw: string;
        try {
            raw = readFileSync(file, 'utf8');
        } catch {
            return null;
        }
        const text = parseText(raw);
        return text.kind === 'ok' ? text.value : null;
    }
}

export class CompactLimitFiles implements CompactLimits {
    private readonly paths: CompactLimitPaths;
    private readonly launches: ClaudeLaunches | null;
    private readonly claudeFiles = new ParsedFile(parseClaudeFile);
    private readonly codexFiles = new ParsedFile(codexLimitIn);

    constructor(paths: CompactLimitPaths, launches: ClaudeLaunches | null = null) {
        this.paths = paths;
        this.launches = launches;
    }

    limitOf(kind: HarnessKind, model: Text | null, cwd: Directory | null, session: SessionId | null): CompactLimit {
        switch (String(kind)) {
            case 'claude':
                return this.claude(model, cwd, session);
            case 'codex':
                return { window: this.codex(), percent: null };
            default:
                return NO_LIMIT;
        }
    }

    private claude(model: Text | null, cwd: Directory | null, session: SessionId | null): CompactLimit {
        const launch = session === null ? null : this.launches?.launchOf(session) ?? null;
        const layers = this.claudeLayers(cwd, launch);
        return {
            window: launch?.env.window ?? firstOf(layers, (layer) => layer.env.window) ?? firstOf(layers, (layer) => claudeLimitIn(layer, model)),
            percent: launch?.env.percent ?? firstOf(layers, (layer) => layer.env.percent),
        };
    }

    private claudeLayers(cwd: Directory | null, launch: ClaudeLaunch | null): ClaudeSettings[] {
        const managed = this.paths.managed.map((file) => this.claudeFiles.read(file));
        const flagged = launch === null || launch.settings === null ? null : parseClaudeFile(launch.settings);
        const files = this.projectAndUser(cwd).map((file) => this.claudeFiles.read(file));
        return [...managed, flagged, ...files].filter(present);
    }

    private projectAndUser(cwd: Directory | null): FsPath[] {
        const project = cwd === null ? [] : [must(parseFsPath(join(cwd, '.claude', 'settings.local.json'))), must(parseFsPath(join(cwd, '.claude', 'settings.json')))];
        return [...project, must(parseFsPath(join(this.paths.home, '.claude', 'settings.json')))];
    }

    private codex(): Count | null {
        return this.codexFiles.read(must(parseFsPath(join(this.paths.home, '.codex', 'config.toml')))) ?? null;
    }
}

export function systemCompactLimits(): CompactLimits {
    const home = must(parseFsPath(homedir()));
    const managed = MANAGED_SETTINGS.map((path) => must(parseFsPath(path)));
    return new CompactLimitFiles({ home, managed }, new ClaudeLaunchPosix({ home, proc: must(parseFsPath('/proc')) }));
}
