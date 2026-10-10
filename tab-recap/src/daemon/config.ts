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
import { compactJobOf, curateJobOf, deciderJobOf, judgeJobOf, keepDaysOf } from '#src/recap/domain/job.ts';
import type { DeciderJob, Job } from '#src/recap/domain/job.ts';
import { briefRetentionOf, coverageByOf, jevOf, policyOf } from '#src/recap/domain/autocompact.ts';
import type { AutocompactPolicy, BriefRetention, CoverageBy, JevSettings } from '#src/recap/domain/autocompact.ts';
import { tuningOf } from '#src/recap/domain/autocompact-style.ts';
import type { AutocompactTuning } from '#src/recap/domain/autocompact-style.ts';
import { hintOf, targetOf, windowOf } from '#src/recap/domain/compaction.ts';
import type { CompactTarget } from '#src/recap/domain/compaction.ts';
import type { Sizing } from '#src/recap/domain/layout.ts';

import { BACKEND_IDS, modelOf } from '#src/recap/domain/backend.ts';
import { tabKeepDaysOf } from '#src/recap/domain/retention.ts';
import { effortOf } from '#src/recap/domain/effort.ts';
import { herdrEventsOf } from '#src/recap/domain/herdr-events.ts';
import type { HerdrEvents } from '#src/recap/domain/herdr-events.ts';
import { compactNoteOf } from '#src/recap/domain/compact-note.ts';
import type { CompactNote } from '#src/recap/domain/compact-note.ts';
import { telemetryTagsOf } from '#src/recap/domain/telemetry-tags.ts';
import type { TelemetryTags } from '#src/recap/domain/telemetry-tags.ts';
import { RECONCILE_EVERY } from '#src/recap/application/ledger-reconcile.ts';
import { DEFAULT_PIPELINE, pipelineOf } from '#src/recap/domain/pipeline.ts';
import type { Pipeline } from '#src/recap/domain/pipeline.ts';
import { debounceOf } from '#src/recap/domain/debounce.ts';
import type { Debounce } from '#src/recap/domain/debounce.ts';
import type { Effort } from '#src/recap/domain/effort.ts';
import type { BackendChoice, BackendId } from '#src/recap/domain/backend.ts';
import { FULL_WRITER_VIEW, KEEP_NEWEST_RANGE, NEXT_HOURS_RANGE, keepNewestOf, nextHoursOf, prunedWriterView } from '#src/recap/domain/writer-view.ts';
import type { PrunedWriterView, WriterView } from '#src/recap/domain/writer-view.ts';

export { BACKEND_IDS } from '#src/recap/domain/backend.ts';
export type { BackendChoice, BackendId } from '#src/recap/domain/backend.ts';

export interface Config {
    readonly backend: BackendChoice;
    readonly models: Readonly<Record<BackendId, string>>;
    readonly customCommand: string;
    readonly effort: Effort;
    readonly pipeline: Pipeline;
    readonly recapDebounce: Debounce;
    readonly reconcileEvery: number;
    readonly locale: Locale;
    readonly recapLanguage: string;
    readonly sizing: Sizing;
    readonly policy: Policy;
    readonly screenAgents: readonly string[];
    readonly compaction: { readonly target: CompactTarget; readonly hint: number | null; readonly window: number | null };
    readonly brief: Job;
    readonly judge: Job;
    readonly keepInputDays: number;
    readonly keepBrief: BriefRetention;
    readonly curator: Job;
    readonly autocompact: AutocompactPolicy;
    readonly tuning: AutocompactTuning;
    readonly decider: DeciderJob;
    readonly coverage: CoverageBy;
    readonly jev: JevSettings;
    readonly keepDays: number;
    readonly glow: 'auto' | 'on' | 'off';
    readonly timeoutMs: number;
    readonly herdrEvents: HerdrEvents;
    readonly compactNote: CompactNote;
    readonly writerView: WriterView;
    readonly writerViewSettings: PrunedWriterView;
    readonly telemetryTags: TelemetryTags;
}

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

function rangedInteger(raw: string | undefined, fallback: number, min: number, max: number): number {
    const parsed = Number(raw);
    return raw !== undefined && Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

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

export function modelsOf(get: (key: string) => string | undefined, choice: BackendChoice): Readonly<Record<BackendId, string>> {
    const modelFor = (id: BackendId): string => {
        const model = modelOf(id);
        if (model === null) {
            return '';
        }
        const legacyKey = model.legacyEnv;
        const legacy = legacyKey === null ? undefined : get(legacyKey);
        const own = get(`TAB_RECAP_MODEL_${id.toUpperCase()}`) ?? (legacy === '' ? undefined : legacy);
        return own ?? (choice === id ? get('TAB_RECAP_MODEL') : undefined) ?? '';
    };
    return Object.fromEntries(BACKEND_IDS.map((id) => [id, modelFor(id)])) as Record<BackendId, string>;
}

function readFile(): ReadonlyMap<string, string> {
    try { return parseEnv(readFileSync(join(configDir(), 'config.env'), 'utf8')); } catch { return new Map(); }
}

export function configGetter(): (key: string) => string | undefined {
    return (key: string): string | undefined => given(key) ?? readFile().get(key);
}

export function loadConfig(): Config {
    const file = readFile();
    const get = (key: string): string | undefined => given(key) ?? file.get(key);
    const glow = get('TAB_RECAP_GLOW');
    const pruneWriterView = get('TAB_RECAP_WRITER_PRUNE');
    const keepNewest = rangedInteger(get('TAB_RECAP_WRITER_KEEP_NEWEST'), KEEP_NEWEST_RANGE.fallback, KEEP_NEWEST_RANGE.min, KEEP_NEWEST_RANGE.max);
    const nextHours = rangedInteger(get('TAB_RECAP_WRITER_NEXT_HOURS'), NEXT_HOURS_RANGE.fallback, NEXT_HOURS_RANGE.min, NEXT_HOURS_RANGE.max);
    const writerViewSettings = prunedWriterView(keepNewestOf(keepNewest), nextHoursOf(nextHours));
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
        pipeline: pipelineOf(get('TAB_RECAP_PIPELINE')) ?? DEFAULT_PIPELINE,
        recapDebounce: debounceOf(get('TAB_RECAP_RUN_DEBOUNCE_MS')),
        reconcileEvery: Math.max(1, Math.floor(number(get('TAB_RECAP_RECONCILE_EVERY'), RECONCILE_EVERY))),
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
            closeGrace: duration(number(get('TAB_RECAP_CLOSE_GRACE_MS'), DEFAULT_POLICY.closeGrace)),
            onlyTabs: only === undefined ? [] : only.split(',').map((tab) => tab.trim()).filter((tab) => tab !== ''),
        },
        screenAgents,
        compaction: { target: targetOf(get('TAB_RECAP_COMPACT_TARGET')), hint: hintOf(get('TAB_RECAP_COMPACT_HINT')), window: windowOf(get('TAB_RECAP_CONTEXT_WINDOW')) },
        brief: compactJobOf(get),
        judge: judgeJobOf(get),
        keepInputDays: keepDaysOf(get('TAB_RECAP_KEEP_INPUT_DAYS')),
        keepBrief: briefRetentionOf(get('TAB_RECAP_KEEP_BRIEF_DAYS')),
        curator: curateJobOf(get),
        autocompact: policyOf(get),
        tuning: tuningOf(get),
        decider: deciderJobOf(get),
        coverage: coverageByOf(get('TAB_RECAP_AUTOCOMPACT_COVERAGE_BY')),
        jev: jevOf(get),
        keepDays: tabKeepDaysOf(get('TAB_RECAP_KEEP_DAYS')),
        glow: glow === 'on' || glow === 'off' ? glow : 'auto',
        timeoutMs: number(get('TAB_RECAP_TIMEOUT_MS'), 180_000),
        herdrEvents: herdrEventsOf(get('TAB_RECAP_HERDR_EVENTS')),
        compactNote: compactNoteOf(get('TAB_RECAP_COMPACT_NOTE')),
        writerView: pruneWriterView === 'on' ? writerViewSettings : FULL_WRITER_VIEW,
        writerViewSettings,
        telemetryTags: telemetryTagsOf(get('TAB_RECAP_TELEMETRY_TAGS')),
    };
}
