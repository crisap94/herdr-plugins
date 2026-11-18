import { join } from 'node:path';
import { must } from '#src/protocol/result.ts';
import { handoff } from '#src/protocol/exchanges/handoff.ts';
import type { TokenMap } from '#src/protocol/tokens.ts';
import type { CheckAnchors, Judge } from '#src/ports/judge.ts';
import type { HarnessRuntime } from '#src/adapters/harness/library.ts';
import type { CompactRequests } from '#src/recap/application/compact-requests.ts';
import { ANY_KIND } from '#src/recap/domain/policy.ts';
import { herdrEventsOf } from '#src/recap/domain/herdr-events.ts';
import { capabilityOf } from '#src/recap/domain/lane-tokens.ts';
import { notesOf } from '#src/recap/domain/coordination.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import { duration } from '#src/recap/domain/time.ts';
import { parseDirectory, type Directory } from '#src/recap/domain/directory.ts';
import type { Available, TextAnchors } from './backends.ts';
import { boundedBy, withinBy, type Bounded } from './bounded.ts';
import type { Box } from './dispatch-parts.ts';
import type { HandoffExchangeWiring } from './handoff-exchange-wiring.ts';
import type { Worktrees } from './worktrees.ts';
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
import { BACKEND_IDS, environmentName } from '#src/recap/domain/backend.ts';
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

const isBackendId = (id: string): id is BackendId => BACKEND_IDS.some((known) => known === id);

export function availableIn(ids: readonly string[]): Available {
    return ids.filter(isBackendId);
}

export function summarizerWork(root: string): Directory {
    return must(parseDirectory(join(root, 'summarizer')));
}

const textAnchors = (anchors: CheckAnchors): TextAnchors => new Map([...anchors].map(([key, found]) => [must(parseText(key)), found]));

export type JudgeWith = (config: Config, available: Available, work: Directory, runtime: HarnessRuntime, anchors?: TextAnchors) => Judge | null;

const judges: { made?: JudgeWith } = {};

export function judgeVia(made: JudgeWith): void {
    judges.made = made;
}

export function judgeFor(config: Config, available: Available, work: Directory, runtime: HarnessRuntime, anchors?: CheckAnchors): Judge | null {
    if (judges.made === undefined) {
        throw new Error('judgeFor runs once src/daemon/backends.ts is loaded');
    }
    return judges.made(config, available, work, runtime, anchors === undefined ? undefined : textAnchors(anchors));
}

export async function bounded(task: Promise<void>, ms: number): Promise<Bounded> {
    return boundedBy(task, duration(ms));
}

export async function within<T>(task: Promise<T>, ms: number, fallback: T): Promise<T> {
    return withinBy(task, duration(ms), fallback);
}

export function logVia(write: (line: Text) => void): (line: string) => void {
    return (line) => { write(must(parseText(line))); };
}

export function herdrEventsOn(): boolean {
    return loadConfig().herdrEvents === 'on';
}

function switchOn(setting: string): boolean {
    return setting === handoff.optIn ? loadConfig().handoffRequests === 'on' : herdrEventsOf(configGetter()(setting)) === 'on';
}

export function capabilityNow(): string {
    return capabilityOf(switchOn);
}

export function wantsScreen(agent: string): boolean {
    const { screenAgents } = loadConfig();
    return screenAgents.includes(ANY_KIND) || screenAgents.includes(agent);
}

export function listeningIn(box: Box): () => boolean {
    return () => box.informer?.listening ?? false;
}

export function failureLog(log: (line: string) => void, what: string): (error: unknown) => void {
    return (error) => { log(`${what}: ${error instanceof Error ? error.message : String(error)}`); };
}

export function paneTokensTo(worktrees: Worktrees, answers: CompactRequests, exchange: HandoffExchangeWiring): (pane: string, tokens: TokenMap) => void {
    return (pane, tokens) => {
        worktrees.feed.update(paneId(pane), notesOf(tokens));
        answers.onPaneTokens(pane, tokens);
        exchange.responder.onPaneTokens(paneId(pane), new Map(Object.entries(tokens).map(([name, raw]): [Text, Text] => [must(parseText(name)), must(parseText(raw))])));
    };
}
