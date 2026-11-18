import { must } from '#src/protocol/result.ts';
import type { Locale } from '#src/i18n/index.ts';
import type { Policy } from '#src/recap/domain/policy.ts';
import type { DeciderJob, Job } from '#src/recap/domain/job.ts';
import type { AutocompactPolicy, BriefRetention, CoverageBy, JevSettings } from '#src/recap/domain/autocompact.ts';
import type { AutocompactTuning } from '#src/recap/domain/autocompact-style.ts';
import type { Sizing } from '#src/recap/domain/layout.ts';
import type { ClosedLaneDays } from '#src/recap/domain/retention.ts';
import type { HerdrEvents } from '#src/recap/domain/herdr-events.ts';
import type { HandoffRequests } from '#src/recap/domain/handoff-requests.ts';
import type { CompactNote } from '#src/recap/domain/compact-note.ts';
import type { TelemetryTags } from '#src/recap/domain/telemetry-tags.ts';
import type { ClaudePolicyAck } from '#src/recap/domain/claude-policy-ack.ts';
import type { RepairMode } from '#src/recap/application/job-kit/repair.ts';
import type { CloseEvidence, Pipeline } from '#src/recap/domain/pipeline.ts';
import type { Debounce } from '#src/recap/domain/debounce.ts';
import type { Effort } from '#src/recap/domain/effort.ts';
import type { BackendChoice, BackendId } from '#src/recap/domain/backend.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { PrunedWriterView, WriterView } from '#src/recap/domain/writer-view.ts';
import { environmentName } from '#src/recap/domain/backend.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { backendFrom, configDirectory, loadSettings, localeFrom, modelsFrom, parseSettingsFile, settingReader, stateDirectory } from './config.ts';
import type { CompactionSettings, SettingReader } from './settings.ts';

export type LegacyReader = (key: string) => string | undefined;

export interface Config {
    readonly backend: BackendChoice;
    readonly models: Readonly<Record<BackendId, string>>;
    readonly customCommand: string;
    readonly effort: Effort;
    readonly pipeline: Pipeline;
    readonly writerCloseEvidence: CloseEvidence;
    readonly recapDebounce: Debounce;
    readonly reconcileEvery: number;
    readonly locale: Locale;
    readonly recapLanguage: string;
    readonly sizing: Sizing;
    readonly policy: Policy;
    readonly screenAgents: readonly string[];
    readonly compaction: CompactionSettings;
    readonly brief: Job;
    readonly judge: Job;
    readonly keepInputDays: number;
    readonly keepBrief: BriefRetention;
    readonly curator: Job;
    readonly curatorRepair: RepairMode;
    readonly autocompact: AutocompactPolicy;
    readonly tuning: AutocompactTuning;
    readonly decider: DeciderJob;
    readonly coverage: CoverageBy;
    readonly jev: JevSettings;
    readonly keepDays: number;
    readonly closedLaneDays: ClosedLaneDays;
    readonly glow: 'auto' | 'on' | 'off';
    readonly timeoutMs: number;
    readonly herdrEvents: HerdrEvents;
    readonly handoffRequests: HandoffRequests;
    readonly compactNote: CompactNote;
    readonly writerView: WriterView;
    readonly writerViewSettings: PrunedWriterView;
    readonly telemetryTags: TelemetryTags;
    readonly claudePolicyAck: ClaudePolicyAck;
}

export function legacyReader(read: SettingReader): LegacyReader {
    return (key) => (key.trim() === '' ? undefined : read(environmentName(key)));
}

const textOf = (raw: string | undefined): Text | undefined => {
    const parsed = parseText(raw);
    return parsed.kind === 'ok' ? parsed.value : undefined;
};

const typedReader = (get: LegacyReader): SettingReader => (key) => textOf(get(key));

export function configDir(): string {
    return configDirectory();
}

export function stateDir(): string {
    return stateDirectory();
}

export function parseEnv(text: string): ReadonlyMap<string, string> {
    return must(parseSettingsFile(text));
}

export function localeOf(setting: string | undefined, env: Readonly<Record<string, string | undefined>>): Locale {
    return localeFrom(textOf(setting), typedReader((key) => env[key]));
}

export function backendOf(raw: string | undefined): BackendChoice {
    return backendFrom(textOf(raw));
}

export function modelsOf(get: LegacyReader, choice: BackendChoice): Readonly<Record<BackendId, string>> {
    return modelsFrom(typedReader(get), choice);
}

export function configGetter(): LegacyReader {
    return legacyReader(settingReader());
}

export function loadConfig(): Config {
    return loadSettings();
}
