// KEY=VALUE lines in $HERDR_PLUGIN_CONFIG_DIR/config.env; real environment variables win.
// Re-read on every use, so a backend switch applies to the next recap without a restart.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { messagesFor, recapLanguageOf } from '#src/i18n/index.ts';
import type { Locale, Messages } from '#src/i18n/index.ts';
import { duration } from '#src/recap/domain/time.ts';
import { DEFAULT_POLICY } from '#src/recap/domain/policy.ts';
import type { Policy } from '#src/recap/domain/policy.ts';
import type { Sizing } from '#src/recap/domain/layout.ts';

import { BACKEND_IDS } from '#src/recap/domain/backend.ts';
import type { BackendChoice, BackendId } from '#src/recap/domain/backend.ts';

export { BACKEND_IDS } from '#src/recap/domain/backend.ts';
export type { BackendChoice, BackendId } from '#src/recap/domain/backend.ts';

export interface Config {
    readonly backend: BackendChoice;
    readonly models: Readonly<Record<BackendId, string>>;
    readonly customCommand: string;
    readonly locale: Locale;
    /** `en`, `es` or sanitised free text: what new recaps are written in */
    readonly recapLanguage: string;
    readonly words: number;
    readonly sizing: Sizing;
    readonly policy: Policy;
    readonly glow: 'auto' | 'on' | 'off';
    readonly timeoutMs: number;
}

const home = homedir();

function given(key: string): string | undefined {
    const value = process.env[key];
    return value === undefined || value === '' ? undefined : value;
}

export function configDir(): string {
    return given('HERDR_PLUGIN_CONFIG_DIR') ?? join(home, '.config', 'herdr', 'plugins', 'config', 'tab-recap');
}

export function stateDir(): string {
    return given('TAB_RECAP_STATE') ?? given('HERDR_PLUGIN_STATE_DIR') ?? join(home, '.local', 'state', 'herdr', 'plugins', 'tab-recap');
}

export function parseEnv(text: string): ReadonlyMap<string, string> {
    const values = new Map<string, string>();
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        const eq = line.indexOf('=');
        if (line.startsWith('#') || eq <= 0) {
            continue;
        }
        let value = line.slice(eq + 1).trim();
        const quote = value[0];
        if (value.length >= 2 && (quote === '"' || quote === "'") && value.endsWith(quote)) {
            value = value.slice(1, -1);
        }
        values.set(line.slice(0, eq).trim(), value);
    }
    return values;
}

function number(raw: string | undefined, fallback: number): number {
    const parsed = Number(raw);
    return raw !== undefined && Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** TAB_RECAP_LOCALE=auto|en|es; auto reads LC_ALL, else LC_MESSAGES, else LANG (the first one set), `es*` → es. */
export function localeOf(setting: string | undefined, env: Readonly<Record<string, string | undefined>>): Locale {
    if (setting === 'en' || setting === 'es') {
        return setting;
    }
    const posix = ['LC_ALL', 'LC_MESSAGES', 'LANG'].map((key) => env[key]).find((value) => value !== undefined && value !== '') ?? '';
    return posix.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function messagesOf(): Messages {
    return messagesFor(loadConfig().locale);
}

export function backendOf(raw: string | undefined): BackendChoice {
    return BACKEND_IDS.find((id) => id === raw) ?? 'auto';
}

/**
 * Each backend keeps its own model, so switching back and forth never loses one:
 * TAB_RECAP_MODEL_<ID>, then the legacy TAB_RECAP_CLAUDE_MODEL / TAB_RECAP_CODEX_MODEL. The legacy
 * TAB_RECAP_MODEL belongs to the one backend that was chosen by name, never to `auto`.
 */
export function modelsOf(get: (key: string) => string | undefined, choice: BackendChoice): Readonly<Record<BackendId, string>> {
    const legacy: Readonly<Partial<Record<BackendId, string>>> = { claude: get('TAB_RECAP_CLAUDE_MODEL') ?? '', codex: get('TAB_RECAP_CODEX_MODEL') ?? '' };
    const modelOf = (id: BackendId): string => {
        const own = get(`TAB_RECAP_MODEL_${id.toUpperCase()}`) ?? (legacy[id] === '' ? undefined : legacy[id]);
        return own ?? (choice === id ? get('TAB_RECAP_MODEL') : undefined) ?? '';
    };
    return { claude: modelOf('claude'), codex: modelOf('codex'), opencode: modelOf('opencode'), hermes: modelOf('hermes'), custom: '' };
}

function readFile(): ReadonlyMap<string, string> {
    try { return parseEnv(readFileSync(join(configDir(), 'config.env'), 'utf8')); } catch { return new Map(); }
}

/** Environment first, then config.env — re-read on every call, so edits apply without a restart. */
export function configGetter(): (key: string) => string | undefined {
    return (key: string): string | undefined => given(key) ?? readFile().get(key);
}

export function loadConfig(): Config {
    const file = readFile();
    const get = (key: string): string | undefined => given(key) ?? file.get(key);
    const glow = get('TAB_RECAP_GLOW');
    const kinds = get('TAB_RECAP_AGENTS');
    const only = get('TAB_RECAP_TABS');
    const backend = backendOf(get('TAB_RECAP_BACKEND'));
    const locale = localeOf(get('TAB_RECAP_LOCALE'), process.env);
    return {
        locale,
        recapLanguage: recapLanguageOf(get('TAB_RECAP_RECAP_LANG'), locale),
        backend,
        models: modelsOf(get, backend),
        customCommand: get('TAB_RECAP_CUSTOM_CMD') ?? '',
        words: number(get('TAB_RECAP_WORDS'), 450),
        sizing: {
            fraction: Math.min(0.6, number(get('TAB_RECAP_WIDTH'), 0.3)),
            minCols: number(get('TAB_RECAP_MIN_COLS'), 36),
            maxCols: number(get('TAB_RECAP_MAX_COLS'), 64),
        },
        policy: {
            ...DEFAULT_POLICY,
            kinds: kinds === undefined ? DEFAULT_POLICY.kinds : kinds.split(',').map((kind) => kind.trim()).filter((kind) => kind !== ''),
            minTabCols: number(get('TAB_RECAP_MIN_TAB_COLS'), DEFAULT_POLICY.minTabCols),
            giveUpFor: duration(number(get('TAB_RECAP_GIVE_UP_MS'), DEFAULT_POLICY.giveUpFor)),
            onlyTabs: only === undefined ? [] : only.split(',').map((tab) => tab.trim()).filter((tab) => tab !== ''),
        },
        glow: glow === 'on' || glow === 'off' ? glow : 'auto',
        timeoutMs: number(get('TAB_RECAP_TIMEOUT_MS'), 180_000),
    };
}
