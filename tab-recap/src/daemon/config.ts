import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { xdgPaths } from '#src/adapters/os/config/paths-xdg.ts';
import { languageSettingOf, messagesFor, recapLanguageOfSetting } from '#src/i18n/index.ts';
import type { LanguageSource, Locale, Messages } from '#src/i18n/index.ts';
import { fsPathOf } from '#src/recap/domain/fs-path.ts';
import { duration, parseDuration } from '#src/recap/domain/time.ts';
import { ANY_KIND, DEFAULT_POLICY, screenKindsOf } from '#src/recap/domain/policy.ts';
import type { Policy } from '#src/recap/domain/policy.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import type { JobReader } from '#src/recap/domain/job.ts';
import { compactSettingOf, coverageSettingOf, curateSettingOf, deciderSettingOf, judgeSettingOf, keepDaysCountOf } from '#src/recap/domain/job.ts';
import { parseBriefRetention, parseCoverageBy, jevFrom, policyFrom as autocompactPolicyFrom } from '#src/recap/domain/autocompact.ts';
import { tuningFrom } from '#src/recap/domain/autocompact-style.ts';
import { HINT_DEFAULT, hintOf, targetOf, windowOf } from '#src/recap/domain/compaction.ts';
import type { Sizing } from '#src/recap/domain/layout.ts';
import { BACKEND_IDS, environmentName, harnessLabels, modelOf, type BackendChoice, type BackendId, type EnvironmentName } from '#src/recap/domain/backend.ts';
import { closedLaneDaysOrDefault, parseClosedLaneDays, tabKeepCountOf } from '#src/recap/domain/retention.ts';
import { effortOf } from '#src/recap/domain/effort.ts';
import { herdrEventsFrom } from '#src/recap/domain/herdr-events.ts';
import { parseHandoffRequests } from '#src/recap/domain/handoff-requests.ts';
import { parseIdleHold } from '#src/recap/domain/idle-hold.ts';
import { compactNoteOf } from '#src/recap/domain/compact-note.ts';
import { telemetryTagsOf } from '#src/recap/domain/telemetry-tags.ts';
import { CLAUDE_POLICY_ACK_DEFAULT, CLAUDE_POLICY_ACKS } from '#src/recap/domain/claude-policy-ack.ts';
import { RECONCILE_EVERY } from '#src/recap/application/ledger-reconcile.ts';
import { parseRepairMode, repairModeOr } from '#src/recap/application/job-kit/repair.ts';
import { closeEvidenceOr, DEFAULT_PIPELINE, parseCloseEvidence, pipelineOf } from '#src/recap/domain/pipeline.ts';
import { debounceOf } from '#src/recap/domain/debounce.ts';
import { parsePacing, type Pacing } from '#src/recap/domain/pacing.ts';
import { FULL_WRITER_VIEW, KEEP_NEWEST_RANGE, NEXT_HOURS_RANGE, keepNewestOf, nextHoursOf, prunedWriterView, type PrunedWriterView } from '#src/recap/domain/writer-view.ts';
import { uncheckedRatio } from '#src/recap/domain/ids.ts';
import { countOf, parseCount, parsePositiveCount, type Count, type PositiveCount } from '#src/recap/domain/count.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';
import { err, must, ok, type Result } from '#src/protocol/result.ts';
import { parseText, textOf as uncheckedText, type Text } from '#src/recap/domain/text.ts';
import { parseDirectory, type Directory } from '#src/recap/domain/directory.ts';
import { parseAgentKind, uncheckedAgentKind, type AgentKind } from '#src/recap/domain/ids.ts';
import { capabilityOf } from '#src/recap/domain/lane-tokens.ts';
import { handoff } from '#src/protocol/exchanges/handoff.ts';
import type { OptIn, TokenValue } from '#src/protocol/primitives.ts';
import type { Setting } from '#src/protocol/capability.ts';
import { numberIn, type NumberRange } from '#src/recap/domain/number-in.ts';
import type { CompactionSettings, Glow, Models, SettingGet, SettingName, SettingReader, Settings } from './settings.ts';

export type SettingsFile = ReadonlyMap<EnvironmentName, Text>;

export { BACKEND_IDS } from '#src/recap/domain/backend.ts';
export type { BackendChoice, BackendId } from '#src/recap/domain/backend.ts';
export type { CompactionSettings, Glow, Models, SettingGet, SettingReader, Settings } from './settings.ts';

const defaults = xdgPaths(fsPathOf(homedir()));

export const herdrEventsPresence = (): Presence => (loadSettings().herdrEvents === 'on' ? 'present' : 'absent');

const switchOn = (setting: OptIn): Setting => ((setting === handoff.optIn ? loadSettings().handoffRequests === 'on' : herdrEventsFrom(settingReader()(environmentName(uncheckedText(setting)))) === 'on') ? 'on' : 'off');

export const advertisedCapability = (): TokenValue => capabilityOf(switchOn);

export const screenWanted = (agent: AgentKind): Presence => {
    const { screenAgents } = loadSettings();
    return screenAgents.includes(uncheckedAgentKind(ANY_KIND)) || screenAgents.includes(agent) ? 'present' : 'absent';
};

const keyOf = (name: SettingName): EnvironmentName => environmentName(must(parseText(name)));

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

export const environmentReader: SettingReader = (key) => {
    const value = process.env[key];
    return value === undefined || value === '' ? undefined : textOf(parseText(value));
};

const directoryOr = (parsed: Result<Directory, ParseFailure>, fallback: Directory): Directory => (parsed.kind === 'ok' ? parsed.value : fallback);

export function configDirectory(): Directory {
    return directoryOr(parseDirectory(environmentReader(keyOf('HERDR_PLUGIN_CONFIG_DIR'))), must(parseDirectory(defaults.configDir)));
}

export function stateDirectory(): Directory {
    return directoryOr(parseDirectory(environmentReader(keyOf('TAB_RECAP_STATE')) ?? environmentReader(keyOf('HERDR_PLUGIN_STATE_DIR'))), must(parseDirectory(defaults.stateDir)));
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
        values.set(environmentName(must(parseText(line.slice(0, eq).trim()))), must(parseText(value)));
    }
    return ok(values);
}

const POSITIVE: NumberRange = { min: countOf(Number.MIN_VALUE), max: countOf(Number.MAX_VALUE) };
const KEEP_NEWEST_BOUNDS: NumberRange = { min: countOf(KEEP_NEWEST_RANGE.min), max: countOf(KEEP_NEWEST_RANGE.max) };
const NEXT_HOURS_BOUNDS: NumberRange = { min: countOf(NEXT_HOURS_RANGE.min), max: countOf(NEXT_HOURS_RANGE.max) };
const QUIET_BOUNDS: NumberRange = { min: countOf(10_000), max: countOf(600_000) };
const MAX_WAIT_BOUNDS: NumberRange = { min: countOf(60_000), max: countOf(3_600_000) };

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
        const legacy = legacyKey === null ? undefined : read(legacyKey);
        const own = read(environmentName(must(parseText(`TAB_RECAP_MODEL_${id.toUpperCase()}`)))) ?? (legacy === '' ? undefined : legacy);
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

const readerOf = (file: SettingsFile): SettingReader => (key) => (key === LOCALE || key === RECAP_LANG ? file.get(key) ?? environmentReader(key) : environmentReader(key) ?? file.get(key));

export function settingReader(): SettingReader {
    return (key) => readerOf(readFile())(key);
}

export function settingGetter(): SettingGet {
    const read = settingReader();
    return (name) => read(keyOf(name));
}

export function recapLanguageSource(): LanguageSource {
    const file = readFile();
    const setting = file.get(RECAP_LANG) ?? environmentReader(RECAP_LANG);
    if (languageSettingOf(setting === undefined ? undefined : uncheckedText(setting)) !== 'ui') {
        return file.has(RECAP_LANG) ? 'settings' : 'environment';
    }
    const locale = file.get(LOCALE) ?? environmentReader(LOCALE);
    if (locale === 'en' || locale === 'es') {
        return file.has(LOCALE) ? 'settings' : 'environment';
    }
    return 'system';
}

const sizingFrom = (get: SettingGet): Sizing => ({
    fraction: uncheckedRatio(Math.min(0.6, numberIn(get('TAB_RECAP_WIDTH'), POSITIVE) ?? 0.3)),
    minCols: countOf(numberIn(get('TAB_RECAP_MIN_COLS'), POSITIVE) ?? 36),
    maxCols: countOf(numberIn(get('TAB_RECAP_MAX_COLS'), POSITIVE) ?? 64),
});

const listOf = (raw: Text | undefined): readonly Text[] | undefined => raw?.split(',').flatMap((item) => (item.trim() === '' ? [] : [must(parseText(item.trim()))]));

const policyFrom = (get: SettingGet, screenAgents: readonly AgentKind[]): Policy => ({
    ...DEFAULT_POLICY,
    kinds: [...new Set([...(listOf(get('TAB_RECAP_AGENTS')) ?? DEFAULT_POLICY.kinds), ...screenAgents.map((agent) => uncheckedText(agent))])],
    minTabCols: countOf(numberIn(get('TAB_RECAP_MIN_TAB_COLS'), POSITIVE) ?? DEFAULT_POLICY.minTabCols),
    giveUpFor: duration(numberIn(get('TAB_RECAP_GIVE_UP_MS'), POSITIVE) ?? DEFAULT_POLICY.giveUpFor),
    closeGrace: duration(numberIn(get('TAB_RECAP_CLOSE_GRACE_MS'), POSITIVE) ?? DEFAULT_POLICY.closeGrace),
    onlyTabs: listOf(get('TAB_RECAP_TABS')) ?? [],
});

const compactionFrom = (get: SettingGet): CompactionSettings => {
    const hint = hintOf(get('TAB_RECAP_COMPACT_HINT'));
    const window = parsePositiveCount(windowOf(get('TAB_RECAP_CONTEXT_WINDOW')));
    return { target: targetOf(get('TAB_RECAP_COMPACT_TARGET')), hint: hint === null ? null : countOr(parseCount(hint), HINT), window: window.kind === 'ok' ? window.value : null };
};

const writerViewFrom = (get: SettingGet): PrunedWriterView => prunedWriterView(
    keepNewestOf(numberIn(get('TAB_RECAP_WRITER_KEEP_NEWEST'), KEEP_NEWEST_BOUNDS, 'whole') ?? KEEP_NEWEST_RANGE.fallback),
    nextHoursOf(numberIn(get('TAB_RECAP_WRITER_NEXT_HOURS'), NEXT_HOURS_BOUNDS, 'whole') ?? NEXT_HOURS_RANGE.fallback),
);

const screenAgentsFrom = (get: SettingGet): readonly AgentKind[] => screenKindsOf(get('TAB_RECAP_SCREEN_AGENTS')).flatMap((kind) => {
    const parsed = parseAgentKind(kind);
    return parsed.kind === 'ok' ? [parsed.value] : [];
});

const pacingOf = (get: SettingGet): Pacing => parsePacing(get('TAB_RECAP_RUN_PACING')?.trim().toLowerCase() === 'turn' ? 'turn' : 'smart', numberIn(get('TAB_RECAP_RUN_QUIET_MS'), QUIET_BOUNDS, 'whole') ?? 45_000, numberIn(get('TAB_RECAP_RUN_MAX_WAIT_MS'), MAX_WAIT_BOUNDS, 'whole') ?? 1_200_000);

const reconcileEveryFrom = (get: SettingGet): PositiveCount => positiveOr(parsePositiveCount(Math.max(1, Math.floor(numberIn(get('TAB_RECAP_RECONCILE_EVERY'), POSITIVE) ?? RECONCILE_EVERY))), must(parsePositiveCount(RECONCILE_EVERY)));

export function loadSettings(): Settings {
    const typed = readerOf(readFile());
    const get: SettingGet = (name) => typed(keyOf(name));
    const jobs: JobReader = (key) => typed(environmentName(uncheckedText(key)));
    const writerViewSettings = writerViewFrom(get);
    const screenAgents = screenAgentsFrom(get);
    const backend = backendFrom(get('TAB_RECAP_BACKEND'));
    const locale = localeFrom(get('TAB_RECAP_LOCALE'), environmentReader);
    const herdrEvents = herdrEventsFrom(get('TAB_RECAP_HERDR_EVENTS'));
    const recapLanguageSetting = get('TAB_RECAP_RECAP_LANG');
    return {
        locale,
        recapLanguage: must(parseText(recapLanguageOfSetting(recapLanguageSetting === undefined ? undefined : uncheckedText(recapLanguageSetting), locale))),
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
        brief: compactSettingOf(jobs),
        judge: judgeSettingOf(jobs),
        keepInputDays: keepDaysCountOf(get('TAB_RECAP_KEEP_INPUT_DAYS')),
        keepBrief: parseBriefRetention(get('TAB_RECAP_KEEP_BRIEF_DAYS')),
        curator: curateSettingOf(jobs), curatorRepair: repairModeOr(parseRepairMode(get('TAB_RECAP_CURATOR_REPAIR'))),
        autocompact: autocompactPolicyFrom((key) => typed(environmentName(uncheckedText(key)))),
        tuning: tuningFrom((key) => typed(environmentName(uncheckedText(key)))),
        decider: deciderSettingOf(jobs),
        coverage: parseCoverageBy(get('TAB_RECAP_AUTOCOMPACT_COVERAGE_BY')),
        coverageJob: coverageSettingOf(jobs, deciderSettingOf(jobs)),
        jev: jevFrom((key) => typed(environmentName(uncheckedText(key)))),
        keepDays: tabKeepCountOf(get('TAB_RECAP_KEEP_DAYS')),
        closedLaneDays: closedLaneDaysOrDefault(parseClosedLaneDays(get('TAB_RECAP_CLOSED_LANE_DAYS'))),
        glow: GLOWS.find((choice) => choice === get('TAB_RECAP_GLOW')) ?? 'auto',
        timeoutMs: must(parseDuration(numberIn(get('TAB_RECAP_TIMEOUT_MS'), POSITIVE) ?? 180_000)),
        herdrEvents,
        handoffRequests: parseHandoffRequests(get('TAB_RECAP_HANDOFF_REQUESTS'), herdrEvents),
        holdIdle: parseIdleHold(get('TAB_RECAP_AUTOCOMPACT_HOLD_IDLE')),
        compactNote: compactNoteOf(get('TAB_RECAP_COMPACT_NOTE')),
        writerView: get('TAB_RECAP_WRITER_PRUNE') === 'on' ? writerViewSettings : FULL_WRITER_VIEW,
        writerViewSettings,
        telemetryTags: telemetryTagsOf(get('TAB_RECAP_TELEMETRY_TAGS')),
        claudePolicyAck: CLAUDE_POLICY_ACKS.find((ack) => ack === get('TAB_RECAP_CLAUDE_POLICY_ACK')?.trim().toLowerCase()) ?? CLAUDE_POLICY_ACK_DEFAULT,
    };
}
