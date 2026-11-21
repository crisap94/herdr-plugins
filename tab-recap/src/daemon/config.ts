import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { xdgPaths } from '#src/adapters/os/config/paths-xdg.ts';
import { languageSetting, messagesFor, recapLanguageOf } from '#src/i18n/index.ts';
import type { LanguageSource, Locale, Messages } from '#src/i18n/index.ts';
import { duration, parseDuration } from '#src/recap/domain/time.ts';
import { DEFAULT_POLICY, screenKindsOf } from '#src/recap/domain/policy.ts';
import type { Policy } from '#src/recap/domain/policy.ts';
import { compactJobOf, coverageJobOf, curateJobOf, deciderJobOf, judgeJobOf, keepDaysOf } from '#src/recap/domain/job.ts';
import { parseBriefRetention, parseCoverageBy, jevOf, policyOf } from '#src/recap/domain/autocompact.ts';
import { tuningOf } from '#src/recap/domain/autocompact-style.ts';
import { HINT_DEFAULT, hintOf, targetOf, windowOf } from '#src/recap/domain/compaction.ts';
import type { Sizing } from '#src/recap/domain/layout.ts';
import { BACKEND_IDS, environmentName, harnessLabels, modelOf, type BackendChoice, type BackendId, type EnvironmentName } from '#src/recap/domain/backend.ts';
import { closedLaneDaysOrDefault, parseClosedLaneDays, tabKeepDaysOf } from '#src/recap/domain/retention.ts';
import { effortOf } from '#src/recap/domain/effort.ts';
import { herdrEventsOf } from '#src/recap/domain/herdr-events.ts';
import { parseHandoffRequests } from '#src/recap/domain/handoff-requests.ts';
import { compactNoteOf } from '#src/recap/domain/compact-note.ts';
import { telemetryTagsOf } from '#src/recap/domain/telemetry-tags.ts';
import { CLAUDE_POLICY_ACK_DEFAULT, CLAUDE_POLICY_ACKS } from '#src/recap/domain/claude-policy-ack.ts';
import { RECONCILE_EVERY } from '#src/recap/application/ledger-reconcile.ts';
import { parseRepairMode, repairModeOr } from '#src/recap/application/job-kit/repair.ts';
import { closeEvidenceOr, DEFAULT_PIPELINE, parseCloseEvidence, pipelineOf } from '#src/recap/domain/pipeline.ts';
import { debounceOf } from '#src/recap/domain/debounce.ts';
import { parsePacing, type Pacing } from '#src/recap/domain/pacing.ts';
import { FULL_WRITER_VIEW, KEEP_NEWEST_RANGE, NEXT_HOURS_RANGE, keepNewestOf, nextHoursOf, prunedWriterView, type PrunedWriterView } from '#src/recap/domain/writer-view.ts';
import { parseCount, parsePositiveCount, type Count, type PositiveCount } from '#src/recap/domain/count.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';
import { err, must, ok, type Result } from '#src/protocol/result.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { parseDirectory, type Directory } from '#src/recap/domain/directory.ts';
import { parseAgentKind, type AgentKind } from '#src/recap/domain/ids.ts';
import { numberIn } from '#src/recap/domain/legacy.ts';
import { legacyReader } from './legacy.ts';
import type { CompactionSettings, Glow, Models, SettingGet, SettingName, SettingReader, Settings } from './settings.ts';

export type SettingsFile = ReadonlyMap<EnvironmentName, Text>;

export { BACKEND_IDS } from '#src/recap/domain/backend.ts';
export type { BackendChoice, BackendId } from '#src/recap/domain/backend.ts';
export { backendOf, configDir, configGetter, loadConfig, localeOf, modelsOf, parseEnv, stateDir } from './legacy.ts';
export type { Config } from './legacy.ts';
export type { CompactionSettings, Glow, Models, SettingReader, Settings } from './settings.ts';

const defaults = xdgPaths(homedir());

const keyOf = (name: SettingName): EnvironmentName => environmentName(name);

const LOCALE = keyOf('TAB_RECAP_LOCALE');
const RECAP_LANG = keyOf('TAB_RECAP_RECAP_LANG');
const POSIX_LOCALE = [keyOf('LC_ALL'), keyOf('LC_MESSAGES'), keyOf('LANG')];
const LOCALES: readonly Locale[] = ['en', 'es'];
const GLOWS: readonly Glow[] = ['auto', 'on', 'off'];
const NO_VALUE = must(parseText(''));
const HINT = must(parseCount(HINT_DEFAULT));

const textOf = (parsed: Result<Text, ParseFailure>): Text | undefined => (parsed.kind === 'ok' ? parsed.value : undefined);

const positiveOr = (parsed: Result<PositiveCount, ParseFailure>, fallback: PositiveCount): PositiveCount => (parsed.kind === 'ok' ? parsed.value : fallback);

const countOr = (parsed: Result<Count, ParseFailure>, fallback: Count): Count => (parsed.kind === 'ok' ? parsed.value : fallback);

const given: SettingReader = (key) => {
    const value = process.env[key];
    return value === undefined || value === '' ? undefined : textOf(parseText(value));
};

const directoryOr = (parsed: Result<Directory, ParseFailure>, fallback: Directory): Directory => (parsed.kind === 'ok' ? parsed.value : fallback);

export function configDirectory(): Directory {
    return directoryOr(parseDirectory(given(keyOf('HERDR_PLUGIN_CONFIG_DIR'))), must(parseDirectory(defaults.configDir)));
}

export function stateDirectory(): Directory {
    return directoryOr(parseDirectory(given(keyOf('TAB_RECAP_STATE')) ?? given(keyOf('HERDR_PLUGIN_STATE_DIR'))), must(parseDirectory(defaults.stateDir)));
}

export function parseSettingsFile(input: unknown): Result<SettingsFile, ParseFailure> {
    if (typeof input !== 'string') {
        return err({ kind: 'not-a-string' });
    }
    const values = new Map<EnvironmentName, Text>();
    for (const raw of input.split('\n')) {
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
        values.set(environmentName(line.slice(0, eq).trim()), must(parseText(value)));
    }
    return ok(values);
}

const POSITIVE = { min: Number.MIN_VALUE, max: Number.MAX_VALUE } as const;

export function localeFrom(setting: Text | undefined, env: SettingReader): Locale {
    const chosen = LOCALES.find((locale) => locale === setting);
    if (chosen !== undefined) {
        return chosen;
    }
    const posix = POSIX_LOCALE.map((key) => env(key)).find((value) => value !== undefined && value !== '') ?? '';
    return posix.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function messagesOf(): Messages {
    return messagesFor(loadSettings().locale);
}

export function backendFrom(raw: Text | undefined): BackendChoice {
    return BACKEND_IDS.find((id) => id === raw) ?? 'auto';
}

export function modelsFrom(read: SettingReader, choice: BackendChoice): Models {
    const modelFor = (id: BackendId): Text => {
        const model = modelOf(id);
        if (model === null) {
            return NO_VALUE;
        }
        const legacyKey = model.legacyEnv;
        const legacy = legacyKey === null ? undefined : read(environmentName(legacyKey));
        const own = read(environmentName(`TAB_RECAP_MODEL_${id.toUpperCase()}`)) ?? (legacy === '' ? undefined : legacy);
        return own ?? (choice === id ? read(keyOf('TAB_RECAP_MODEL')) : undefined) ?? NO_VALUE;
    };
    return harnessLabels(modelFor);
}

function readFile(): SettingsFile {
    try {
        const parsed = parseSettingsFile(readFileSync(join(configDirectory(), 'config.env'), 'utf8'));
        return parsed.kind === 'ok' ? parsed.value : new Map();
    } catch {
        return new Map();
    }
}

const readerOf = (file: SettingsFile): SettingReader => (key) => (key === LOCALE || key === RECAP_LANG ? file.get(key) ?? given(key) : given(key) ?? file.get(key));

export function settingReader(): SettingReader {
    return (key) => readerOf(readFile())(key);
}

export function recapLanguageSource(): LanguageSource {
    const file = readFile();
    if (languageSetting(file.get(RECAP_LANG) ?? given(RECAP_LANG)) !== 'ui') {
        return file.has(RECAP_LANG) ? 'settings' : 'environment';
    }
    const locale = file.get(LOCALE) ?? given(LOCALE);
    if (locale === 'en' || locale === 'es') {
        return file.has(LOCALE) ? 'settings' : 'environment';
    }
    return 'system';
}

const sizingFrom = (get: SettingGet): Sizing => ({
    fraction: Math.min(0.6, numberIn(get('TAB_RECAP_WIDTH'), POSITIVE.min, POSITIVE.max) ?? 0.3),
    minCols: numberIn(get('TAB_RECAP_MIN_COLS'), POSITIVE.min, POSITIVE.max) ?? 36,
    maxCols: numberIn(get('TAB_RECAP_MAX_COLS'), POSITIVE.min, POSITIVE.max) ?? 64,
});

const listOf = (raw: Text | undefined): readonly Text[] | undefined => raw?.split(',').flatMap((item) => (item.trim() === '' ? [] : [must(parseText(item.trim()))]));

const policyFrom = (get: SettingGet, screenAgents: readonly AgentKind[]): Policy => ({
    ...DEFAULT_POLICY,
    kinds: [...new Set([...(listOf(get('TAB_RECAP_AGENTS')) ?? DEFAULT_POLICY.kinds), ...screenAgents])],
    minTabCols: numberIn(get('TAB_RECAP_MIN_TAB_COLS'), POSITIVE.min, POSITIVE.max) ?? DEFAULT_POLICY.minTabCols,
    giveUpFor: duration(numberIn(get('TAB_RECAP_GIVE_UP_MS'), POSITIVE.min, POSITIVE.max) ?? DEFAULT_POLICY.giveUpFor),
    closeGrace: duration(numberIn(get('TAB_RECAP_CLOSE_GRACE_MS'), POSITIVE.min, POSITIVE.max) ?? DEFAULT_POLICY.closeGrace),
    onlyTabs: listOf(get('TAB_RECAP_TABS')) ?? [],
});

const compactionFrom = (get: SettingGet): CompactionSettings => {
    const hint = hintOf(get('TAB_RECAP_COMPACT_HINT'));
    const window = parsePositiveCount(windowOf(get('TAB_RECAP_CONTEXT_WINDOW')));
    return { target: targetOf(get('TAB_RECAP_COMPACT_TARGET')), hint: hint === null ? null : countOr(parseCount(hint), HINT), window: window.kind === 'ok' ? window.value : null };
};

const writerViewFrom = (get: SettingGet): PrunedWriterView => prunedWriterView(
    keepNewestOf(numberIn(get('TAB_RECAP_WRITER_KEEP_NEWEST'), KEEP_NEWEST_RANGE.min, KEEP_NEWEST_RANGE.max, true) ?? KEEP_NEWEST_RANGE.fallback),
    nextHoursOf(numberIn(get('TAB_RECAP_WRITER_NEXT_HOURS'), NEXT_HOURS_RANGE.min, NEXT_HOURS_RANGE.max, true) ?? NEXT_HOURS_RANGE.fallback),
);

const screenAgentsFrom = (get: SettingGet): readonly AgentKind[] => screenKindsOf(get('TAB_RECAP_SCREEN_AGENTS')).flatMap((kind) => {
    const parsed = parseAgentKind(kind);
    return parsed.kind === 'ok' ? [parsed.value] : [];
});

const pacingOf = (get: SettingGet): Pacing => parsePacing(get('TAB_RECAP_RUN_PACING')?.trim().toLowerCase() === 'turn' ? 'turn' : 'smart', numberIn(get('TAB_RECAP_RUN_QUIET_MS'), 10_000, 600_000, true) ?? 45_000, numberIn(get('TAB_RECAP_RUN_MAX_WAIT_MS'), 60_000, 3_600_000, true) ?? 1_200_000);

const reconcileEveryFrom = (get: SettingGet): PositiveCount => positiveOr(parsePositiveCount(Math.max(1, Math.floor(numberIn(get('TAB_RECAP_RECONCILE_EVERY'), POSITIVE.min, POSITIVE.max) ?? RECONCILE_EVERY))), must(parsePositiveCount(RECONCILE_EVERY)));

export function loadSettings(): Settings {
    const typed = readerOf(readFile());
    const get: SettingGet = (name) => typed(keyOf(name));
    const legacy = legacyReader(typed);
    const writerViewSettings = writerViewFrom(get);
    const screenAgents = screenAgentsFrom(get);
    const backend = backendFrom(get('TAB_RECAP_BACKEND'));
    const locale = localeFrom(get('TAB_RECAP_LOCALE'), given);
    const herdrEvents = herdrEventsOf(get('TAB_RECAP_HERDR_EVENTS'));
    return {
        locale,
        recapLanguage: must(parseText(recapLanguageOf(get('TAB_RECAP_RECAP_LANG'), locale))),
        backend,
        models: modelsFrom(typed, backend),
        customCommand: get('TAB_RECAP_CUSTOM_CMD') ?? NO_VALUE,
        effort: effortOf(get('TAB_RECAP_EFFORT')),
        pipeline: pipelineOf(get('TAB_RECAP_PIPELINE')) ?? DEFAULT_PIPELINE, writerCloseEvidence: closeEvidenceOr(parseCloseEvidence(get('TAB_RECAP_WRITER_CLOSE_EVIDENCE'))),
        ...(get('TAB_RECAP_WRITER_ANSWER')?.trim().toLowerCase() === 'schema' ? { writerAnswer: 'schema' } : {}),
        recapDebounce: debounceOf(get('TAB_RECAP_RUN_DEBOUNCE_MS')),
        pacing: pacingOf(get),
        reconcileEvery: reconcileEveryFrom(get),
        sizing: sizingFrom(get),
        policy: policyFrom(get, screenAgents),
        screenAgents,
        compaction: compactionFrom(get),
        brief: compactJobOf(legacy),
        judge: judgeJobOf(legacy),
        keepInputDays: countOr(parseCount(keepDaysOf(get('TAB_RECAP_KEEP_INPUT_DAYS'))), must(parseCount(keepDaysOf(undefined)))),
        keepBrief: parseBriefRetention(get('TAB_RECAP_KEEP_BRIEF_DAYS')),
        curator: curateJobOf(legacy), curatorRepair: repairModeOr(parseRepairMode(get('TAB_RECAP_CURATOR_REPAIR'))),
        autocompact: policyOf(legacy),
        tuning: tuningOf(legacy),
        decider: deciderJobOf(legacy),
        coverage: parseCoverageBy(get('TAB_RECAP_AUTOCOMPACT_COVERAGE_BY')),
        coverageJob: coverageJobOf(legacy),
        jev: jevOf(legacy),
        keepDays: countOr(parseCount(tabKeepDaysOf(get('TAB_RECAP_KEEP_DAYS'))), must(parseCount(tabKeepDaysOf(undefined)))),
        closedLaneDays: closedLaneDaysOrDefault(parseClosedLaneDays(get('TAB_RECAP_CLOSED_LANE_DAYS'))),
        glow: GLOWS.find((choice) => choice === get('TAB_RECAP_GLOW')) ?? 'auto',
        timeoutMs: must(parseDuration(numberIn(get('TAB_RECAP_TIMEOUT_MS'), POSITIVE.min, POSITIVE.max) ?? 180_000)),
        herdrEvents,
        handoffRequests: parseHandoffRequests(get('TAB_RECAP_HANDOFF_REQUESTS'), herdrEvents),
        compactNote: compactNoteOf(get('TAB_RECAP_COMPACT_NOTE')),
        writerView: get('TAB_RECAP_WRITER_PRUNE') === 'on' ? writerViewSettings : FULL_WRITER_VIEW,
        writerViewSettings,
        telemetryTags: telemetryTagsOf(get('TAB_RECAP_TELEMETRY_TAGS')),
        claudePolicyAck: CLAUDE_POLICY_ACKS.find((ack) => ack === get('TAB_RECAP_CLAUDE_POLICY_ACK')?.trim().toLowerCase()) ?? CLAUDE_POLICY_ACK_DEFAULT,
    };
}
