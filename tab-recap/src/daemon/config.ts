// KEY=VALUE lines in $HERDR_PLUGIN_CONFIG_DIR/config.env; real environment variables win.
// Re-read on every use, so a backend switch applies to the next recap without a restart.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { configPathsFor } from '#src/adapters/config-paths.ts';
import { nodeHost } from '#src/host/node-host.mjs';
import { messagesFor, recapLanguageOf } from '#src/i18n/index.ts';
import type { Locale, Messages } from '#src/i18n/index.ts';
import { duration } from '#src/recap/domain/time.ts';
import { DEFAULT_POLICY, screenKindsOf } from '#src/recap/domain/policy.ts';
import type { Policy } from '#src/recap/domain/policy.ts';
import { compactJobOf, curateJobOf, judgeJobOf, keepDaysOf } from '#src/recap/domain/job.ts';
import type { Job } from '#src/recap/domain/job.ts';
import { hintOf, targetOf, windowOf } from '#src/recap/domain/compaction.ts';
import type { CompactTarget } from '#src/recap/domain/compaction.ts';
import type { Sizing } from '#src/recap/domain/layout.ts';

import { BACKEND_IDS } from '#src/recap/domain/backend.ts';
import { effortOf } from '#src/recap/domain/effort.ts';
import type { Effort } from '#src/recap/domain/effort.ts';
import type { BackendChoice, BackendId } from '#src/recap/domain/backend.ts';

export { BACKEND_IDS } from '#src/recap/domain/backend.ts';
export type { BackendChoice, BackendId } from '#src/recap/domain/backend.ts';

export interface Config {
    readonly backend: BackendChoice;
    readonly models: Readonly<Record<BackendId, string>>;
    readonly customCommand: string;
    /** `TAB_RECAP_EFFORT`: how hard the writer thinks (`medium` unless set) */
    readonly effort: Effort;
    readonly locale: Locale;
    /** `en`, `es` or sanitised free text: what new recaps are written in */
    readonly recapLanguage: string;
    readonly sizing: Sizing;
    readonly policy: Policy;
    /** the kinds whose lanes are read from their screen, not a transcript: names, or `*` for all */
    readonly screenAgents: readonly string[];
    /** `TAB_RECAP_COMPACT_TARGET`, `TAB_RECAP_COMPACT_HINT` (null = off) and `TAB_RECAP_CONTEXT_WINDOW` (null = found at runtime) */
    readonly compaction: { readonly target: CompactTarget; readonly hint: number | null; readonly window: number | null };
    /** the compaction brief's job: `TAB_RECAP_COMPACT_BY`, `_MODEL`, `_EFFORT` */
    readonly brief: Job;
    /** the judge's job: `TAB_RECAP_JUDGE_BY`, `_MODEL`, `_EFFORT` */
    readonly judge: Job;
    /** `TAB_RECAP_KEEP_INPUT_DAYS`: how long a run's input document is kept for judging (14; 0 = not kept) */
    readonly keepInputDays: number;
    /** the curator's job: `TAB_RECAP_CURATE_BY`, `_MODEL`, `_EFFORT` */
    readonly curator: Job;
    readonly glow: 'auto' | 'on' | 'off';
    readonly timeoutMs: number;
}

/** where the plugin keeps things when herdr does not say: by the OS family (the composition root picks the adapter) */
const defaults = configPathsFor(nodeHost().platform, homedir(), process.env);

function given(key: string): string | undefined {
    const value = process.env[key];
    return value === undefined || value === '' ? undefined : value;
}

export function configDir(): string {
    return given('HERDR_PLUGIN_CONFIG_DIR') ?? defaults.configDir;
}

export function stateDir(): string {
    return given('TAB_RECAP_STATE') ?? given('HERDR_PLUGIN_STATE_DIR') ?? defaults.stateDir;
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
    const screenAgents = screenKindsOf(get('TAB_RECAP_SCREEN_AGENTS'));
    const only = get('TAB_RECAP_TABS');
    const backend = backendOf(get('TAB_RECAP_BACKEND'));
    const locale = localeOf(get('TAB_RECAP_LOCALE'), process.env);
    return {
        locale,
        recapLanguage: recapLanguageOf(get('TAB_RECAP_RECAP_LANG'), locale),
        backend,
        models: modelsOf(get, backend),
        customCommand: get('TAB_RECAP_CUSTOM_CMD') ?? '',
        effort: effortOf(get('TAB_RECAP_EFFORT')),
        sizing: {
            fraction: Math.min(0.6, number(get('TAB_RECAP_WIDTH'), 0.3)),
            minCols: number(get('TAB_RECAP_MIN_COLS'), 36),
            maxCols: number(get('TAB_RECAP_MAX_COLS'), 64),
        },
        policy: {
            ...DEFAULT_POLICY,
            kinds: [...new Set([...(kinds === undefined ? DEFAULT_POLICY.kinds : kinds.split(',').map((kind) => kind.trim()).filter((kind) => kind !== '')), ...screenAgents])],
            minTabCols: number(get('TAB_RECAP_MIN_TAB_COLS'), DEFAULT_POLICY.minTabCols),
            giveUpFor: duration(number(get('TAB_RECAP_GIVE_UP_MS'), DEFAULT_POLICY.giveUpFor)),
            onlyTabs: only === undefined ? [] : only.split(',').map((tab) => tab.trim()).filter((tab) => tab !== ''),
        },
        screenAgents,
        compaction: { target: targetOf(get('TAB_RECAP_COMPACT_TARGET')), hint: hintOf(get('TAB_RECAP_COMPACT_HINT')), window: windowOf(get('TAB_RECAP_CONTEXT_WINDOW')) },
        brief: compactJobOf(get),
        judge: judgeJobOf(get),
        keepInputDays: keepDaysOf(get('TAB_RECAP_KEEP_INPUT_DAYS')),
        curator: curateJobOf(get),
        glow: glow === 'on' || glow === 'off' ? glow : 'auto',
        timeoutMs: number(get('TAB_RECAP_TIMEOUT_MS'), 180_000),
    };
}
