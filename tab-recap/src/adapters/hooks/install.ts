import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { CURL_MIN_VERSION, curlSupports, parseCurlVersion, renderCurlShim } from '@stateforge-labs/harness-hooks';
import { writeAtomically } from '#src/adapters/os/atomic-file.ts';
import { must } from '#src/protocol/result.ts';
import { parseFsPath, type FsPath } from '#src/recap/domain/fs-path.ts';
import { NO, YES, type Flag } from '#src/recap/domain/gui-tab-parts.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { HOOK_LIMITS, type HookHarness } from '#src/wire/hooks/contract.ts';
import { hookShimPath, hooksSocketPath } from '#src/wire/paths.ts';
import { claudeSettings } from './claude-settings.ts';
import { parseSettingsDocument, serializeSettings, type HarnessSettings, type SettingsDocument } from './settings.ts';

export type RefusalReason = 'malformed' | 'curl-missing' | 'curl-old' | 'unwritable';

export interface Done {
    readonly kind: 'done';
    readonly changed: Flag;
}

export interface Refused {
    readonly kind: 'refused';
    readonly why: RefusalReason;
    readonly detail: Text;
}

export type InstallResult = Done | Refused;

export interface InstallIo {
    readonly curlVersionText: () => Text | null;
}

interface Loaded {
    readonly kind: 'loaded';
    readonly document: SettingsDocument;
    readonly original: Text | null;
}

const SHIM_MODE = 0o700;
const NEW_SETTINGS_MODE = 0o644;
const PERMISSION_BITS = 0o777;

const SETTINGS_OF: ReadonlyMap<HookHarness, () => HarnessSettings> = new Map<HookHarness, () => HarnessSettings>([
    ['claude', () => claudeSettings()],
]);

const refused = (why: RefusalReason, detail: Text): Refused => ({ kind: 'refused', why, detail });

export const systemInstallIo: InstallIo = {
    curlVersionText: () => {
        const probe = spawnSync('curl', ['--version'], { encoding: 'utf8' });
        return probe.status === 0 ? must(parseText(probe.stdout)) : null;
    },
};

export function harnessSettings(name: Text | null): readonly HarnessSettings[] | null {
    const chosen = [...SETTINGS_OF].filter(([harness]) => name === null || name === harness);
    return chosen.length === 0 ? null : chosen.map(([, make]) => make());
}

function curlProblem(io: InstallIo): Refused | null {
    const text = io.curlVersionText();
    const version = text === null ? undefined : parseCurlVersion(text);
    if (version === undefined) return refused('curl-missing', must(parseText('curl --version did not run')));
    return curlSupports(version, 'none') ? null : refused('curl-old', must(parseText(`curl ${version} is older than ${CURL_MIN_VERSION.none}`)));
}

function load(path: FsPath): Loaded | Refused {
    if (!existsSync(path)) return { kind: 'loaded', document: must(parseSettingsDocument({})), original: null };
    const original = readFileSync(path, 'utf8');
    const parsed = parseSettingsDocument(original);
    return parsed.kind === 'ok' ? { kind: 'loaded', document: parsed.value, original: must(parseText(original)) } : refused('malformed', must(parseText(`${path}: ${parsed.error}`)));
}

function writeSettings(path: FsPath, document: SettingsDocument, original: Text | null): void {
    const target = original === null ? path : realpathSync(path);
    const temporary = `${target}.${process.pid}.tmp`;
    mkdirSync(dirname(target), { recursive: true });
    rmSync(temporary, { force: true });
    writeFileSync(temporary, serializeSettings(document, original), { mode: NEW_SETTINGS_MODE });
    if (original !== null) chmodSync(temporary, statSync(target).mode & PERMISSION_BITS);
    renameSync(temporary, target);
}

function writeShim(stateDir: FsPath, settings: HarnessSettings): Flag {
    const path = hookShimPath(stateDir);
    const text = renderCurlShim({ harness: settings.harness, socketPath: hooksSocketPath(stateDir), timeoutMs: HOOK_LIMITS.shimMs, tokenSource: 'none', failClosed: false });
    if (existsSync(path) && readFileSync(path, 'utf8') === text && (statSync(path).mode & PERMISSION_BITS) === SHIM_MODE) return NO;
    writeAtomically(path, text, SHIM_MODE);
    return YES;
}

export function installHooks(stateDir: FsPath, settings: HarnessSettings, io: InstallIo): InstallResult {
    const curl = curlProblem(io);
    if (curl !== null) return curl;
    const loaded = load(settings.path);
    if (loaded.kind === 'refused') return loaded;
    const next = settings.add(loaded.document, must(parseFsPath(hookShimPath(stateDir))));
    const settingsChanged = loaded.original === null || !isDeepStrictEqual(next, loaded.document);
    try {
        const shimChanged = writeShim(stateDir, settings);
        if (settingsChanged) writeSettings(settings.path, next, loaded.original);
        return { kind: 'done', changed: settingsChanged || shimChanged === YES ? YES : NO };
    } catch (error) {
        return refused('unwritable', must(parseText(error instanceof Error ? error.message : String(error))));
    }
}

export function uninstallHooks(stateDir: FsPath, settings: HarnessSettings): InstallResult {
    const loaded = load(settings.path);
    if (loaded.kind === 'refused') return loaded;
    const shim = must(parseFsPath(hookShimPath(stateDir)));
    const next = settings.remove(loaded.document, shim);
    const settingsChanged = loaded.original !== null && !isDeepStrictEqual(next, loaded.document);
    const shimFound = existsSync(shim);
    try {
        if (settingsChanged) writeSettings(settings.path, next, loaded.original);
        rmSync(shim, { force: true });
        return { kind: 'done', changed: settingsChanged || shimFound ? YES : NO };
    } catch (error) {
        return refused('unwritable', must(parseText(error instanceof Error ? error.message : String(error))));
    }
}
