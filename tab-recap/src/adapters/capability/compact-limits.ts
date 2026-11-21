import { readFileSync, statSync } from 'node:fs';
import type { Stats } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { must } from '#src/protocol/result.ts';
import type { CompactLimits } from '#src/ports/compact-limits.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import type { Count } from '#src/recap/domain/count.ts';
import { parseFsPath } from '#src/recap/domain/fs-path.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import type { AgentKind } from '#src/recap/domain/ids.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Directory } from '@stateforge-labs/session-ledger/unstable/recap/domain/directory.ts';

const MIN_CLAUDE_WINDOW = 100_000;
const CODEX_LIMIT = /^model_auto_compact_token_limit\s*=\s*(\d+)\s*(?:#.*)?$/;
const SECTION_HEADER = /^\s*\[/;
const MANAGED_SETTINGS = '/etc/claude-code/managed-settings.json';

export type AutoCompactWindow = Count;

export type ModelWindows = ReadonlyMap<Text, AutoCompactWindow>;

export interface ClaudeSettings {
    readonly top: AutoCompactWindow | null;
    readonly models: ReadonlyMap<Text, AutoCompactWindow>;
}

export interface CompactLimitPaths {
    readonly home: FsPath;
    readonly managed: FsPath;
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

export function parseClaudeSettings(input: unknown): ClaudeSettings {
    if (typeof input !== 'object' || input === null) {
        return { top: null, models: new Map<Text, AutoCompactWindow>() };
    }
    return {
        top: 'autoCompactWindow' in input ? parseAutoCompactWindow(input.autoCompactWindow) : null,
        models: parseModelWindows('modelSettings' in input ? input.modelSettings : null),
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
    private readonly claudeFiles = new ParsedFile(parseClaudeFile);
    private readonly codexFiles = new ParsedFile(codexLimitIn);

    constructor(paths: CompactLimitPaths) {
        this.paths = paths;
    }

    limitOf(kind: AgentKind, model: Text | null, cwd: Directory | null): Count | null {
        switch (String(kind)) {
            case 'claude':
                return this.claude(model, cwd);
            case 'codex':
                return this.codex();
            default:
                return null;
        }
    }

    private claude(model: Text | null, cwd: Directory | null): Count | null {
        for (const file of this.claudeSettingsFiles(cwd)) {
            const settings = this.claudeFiles.read(file);
            const limit = settings === null ? null : claudeLimitIn(settings, model);
            if (limit !== null) {
                return limit;
            }
        }
        return null;
    }

    private claudeSettingsFiles(cwd: Directory | null): FsPath[] {
        const project = cwd === null ? [] : [must(parseFsPath(join(cwd, '.claude', 'settings.local.json'))), must(parseFsPath(join(cwd, '.claude', 'settings.json')))];
        return [this.paths.managed, ...project, must(parseFsPath(join(this.paths.home, '.claude', 'settings.json')))];
    }

    private codex(): Count | null {
        return this.codexFiles.read(must(parseFsPath(join(this.paths.home, '.codex', 'config.toml')))) ?? null;
    }
}

export function systemCompactLimits(): CompactLimits {
    return new CompactLimitFiles({ home: must(parseFsPath(homedir())), managed: must(parseFsPath(MANAGED_SETTINGS)) });
}
