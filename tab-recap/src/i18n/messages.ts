import type { Count } from '#src/recap/domain/count.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { MissedFacts, UncheckedReason } from '#src/recap/domain/autocompact.ts';
import type { DeciderBy } from '#src/recap/domain/job.ts';
import type { Refusal } from '#src/host/policy.mjs';
import type { ClosedWhy } from '#src/recap/domain/fact.ts';
import type { HandoffMessageKey } from '#src/recap/domain/handoff-outcome.ts';
import type { ClosePoint } from '#src/recap/domain/lane-closed.ts';

export type { Messages } from './legacy.ts';

export type Locale = 'en' | 'es';

export type AgoUnit = 's' | 'min' | 'h' | 'd';

export type LanguageSource = 'settings' | 'environment' | 'system';

export type LanguageSourceName = 'settings file' | 'environment variable' | 'system language' | 'archivo de ajustes' | 'variable de entorno' | 'idioma del sistema';

export interface LanguageSourceNames {
    readonly settings: LanguageSourceName;
    readonly environment: LanguageSourceName;
    readonly system: LanguageSourceName;
}

export interface BadgeMessages { readonly working: Text; readonly blocked: Text; readonly idle: Text; readonly done: Text; readonly unknown: Text }

export interface AutocompactSettingsMessages {
    readonly ceilingOverride: (enabled: Presence) => Text;
    readonly coverageBackoff: (window: Text) => Text;
    readonly missedFacts: (choice: MissedFacts) => Text;
}

export interface GitMessages { readonly unpushed: (count: Count) => Text; readonly changed: (count: Count) => Text }

export interface HintMessages { readonly column: readonly Text[]; readonly modal: readonly Text[] }

export interface ToggleChoices { readonly on: string; readonly off: string }

export interface LegendMessages { readonly current: string; readonly available: string; readonly missing: string }

export interface UiChoicesMessages { readonly auto: string; readonly en: string; readonly es: string }

export interface EffortChoicesMessages { readonly low: string; readonly medium: string; readonly high: string; readonly default: string }

export interface CompactNoteChoicesMessages {
    readonly ask: string;
    readonly skip: string;
}

export interface AutocompactChoicesMessages { readonly off: string; readonly shadow: string; readonly on: string }

export interface AutocompactStyleChoicesMessages {
    readonly gentle: string;
    readonly balanced: string;
    readonly eager: string;
}

export type LanguageNamesMessages = {
    readonly en: string;
    readonly es: string;
};

export interface SetupTestMessages {
    readonly running: string;
    readonly ok: (seconds: string, cost: string) => string;
    readonly failed: (why: string) => string;
}

export interface SetupMessages {
    readonly title: string;
    readonly rows: Readonly<Record<'recapJob' | 'compactJob' | 'judgeJob' | 'curatorJob' | 'locale' | 'recapLanguage' | 'screenAgents' | 'gitNote' | 'telemetryTags' | 'compactTarget' | 'compactNote' | 'compactHint' | 'contextWindow' | 'autocompact' | 'autocompactAt' | 'autocompactStyle' | 'autocompactMissed' | 'autocompactJob' | 'herdrEvents', string>>;
    readonly loading: string;
    readonly auto: (order: string) => string;
    readonly custom: string;
    readonly legend: LegendMessages;
    readonly locked: (name: string) => string;
    readonly modelDefault: (model: string) => string;
    readonly modelNoAgent: string;
    readonly uiChoices: UiChoicesMessages;
    readonly gitNoteChoices: ToggleChoices;
    readonly herdrEventsChoices: ToggleChoices;
    readonly telemetryTagsChoices: ToggleChoices;
    readonly herdrEventsHint: string;
    readonly effortChoices: EffortChoicesMessages;
    readonly recapLanguageHint: string;
    readonly screenAgentsHint: string;
    readonly compactTargetHint: string;
    readonly compactNoteChoices: CompactNoteChoicesMessages;
    readonly compactNoteHint: string;
    readonly compactHintHint: string;
    readonly compactHintOff: string;
    readonly modelsHeading: string;
    readonly jobBy: Readonly<Record<DeciderBy, string>>;
    readonly jobByChoices: Readonly<Record<DeciderBy, string>>;
    readonly compactModelSame: string;
    readonly compactJobHint: string;
    readonly autocompactChoices: AutocompactChoicesMessages;
    readonly autocompactHint: string;
    readonly autocompactAtHint: string;
    readonly autocompactStyleChoices: AutocompactStyleChoicesMessages;
    readonly autocompactStyleHint: string;
    readonly autocompactMissedChoices: Readonly<Record<MissedFacts, string>>;
    readonly autocompactMissedHint: string;
    readonly autocompactJobHint: string;
    readonly deciderOff: string;
    readonly judgeJobHint: string;
    readonly judgeOffChoice: string;
    readonly curateJobHint: string;
    readonly curateOff: string;
    readonly contextWindowHint: string;
    readonly contextWindowDetected: string;
    readonly screenNone: string;
    readonly screenAll: string;
    readonly languageNames: LanguageNamesMessages;
    readonly sameAsInterface: (language: string) => string;
    readonly editHint: string;
    readonly unsaved: string;
    readonly saved: string;
    readonly nothingToSave: string;
    readonly saveFailed: (why: string) => string;
    readonly rewriting: string;
    readonly test: SetupTestMessages;
    readonly keys: readonly string[];
    readonly editKeys: readonly string[];
}

export interface CompactionFigures {
    readonly tokens: string;
    readonly took: string;
}

export type CompactionOutcome = 'compacted' | 'failed' | 'unconfirmed';

export interface CompactionStageMessages {
    readonly queued: (agent: string | null, clock: string) => string;
    readonly briefing: (agent: string | null, writer: string | null, clock: string) => string;
    readonly compacting: (agent: string | null, clock: string) => string;
    readonly restoring: (agent: string | null) => string;
    readonly compacted: (agent: string | null, figures: string) => string;
    readonly template: string;
    readonly failed: (agent: string | null, why: string | null) => string;
    readonly unconfirmed: (agent: string | null, why: string | null) => string;
    readonly skipped: (agent: string | null, why: string | null) => string;
    readonly restarted: string;
    readonly selfFailed: string;
    readonly tokens: (before: string, after: string) => string;
    readonly took: (seconds: number) => string;
}

export interface CompactionMessages {
    readonly title: (agent: string) => string;
    readonly noteLabel: string;
    readonly keys: readonly string[];
    readonly hint: (percent: number, window: string) => string;
    readonly writing: (agent: string) => string;
    readonly outcome: (agent: string, outcome: CompactionOutcome, retried: boolean, figures: CompactionFigures) => string;
    readonly stage: CompactionStageMessages;
    readonly started: (agent: string) => string;
    readonly startedQueued: (agent: string) => string;
    readonly auto: (text: string) => string;
    readonly coverageMissed: (agent: string) => string;
    readonly coverageCeiling: (count: number) => string;
    readonly coverageUnchecked: Readonly<Record<UncheckedReason, string>>;
    readonly coveragePassed: string;
    readonly skipped: (agent: string, status: string) => string;
    readonly joined: (agent: string, noted: boolean) => string;
    readonly nothing: string;
    readonly failed: (agent: string, why: string) => string;
    readonly laneClosed: (agent: string | null, pane: string, point: ClosePoint) => string;
}

export interface CompactionOriginMessages {
    readonly operator: (count: number) => string;
    readonly auto: (count: number) => string;
}

export interface CausesMessages { readonly 'turn-ended': string; readonly focused: string; readonly requested: string }

export interface ExpandedAutocompactMessages {
    readonly label: string;
    readonly text: (decisions: number, compacted: number, waited: number) => string;
}

export interface ExpandedMessages {
    readonly timeline: string; readonly rules: string; readonly session: string; readonly story: string; readonly updatingStory: string;
    readonly waiting: (amount: number, unit: AgoUnit) => string;
    readonly closed: (why: ClosedWhy) => string;
    readonly started: string; readonly turns: string; readonly compactions: string; readonly compactionOrigin: CompactionOriginMessages; readonly of: string; readonly repo: string; readonly branch: string; readonly files: string;
    readonly causes: CausesMessages;
    readonly autocompact: ExpandedAutocompactMessages;
}

export interface ChaptersMessages {
    readonly label: string;
    readonly count: (chapters: number) => string;
    readonly compacted: string;
    readonly newSession: string;
    readonly seconds: (seconds: number) => string;
    readonly minutes: (minutes: number, seconds: number) => string;
}

export interface DatabaseMessages {
    readonly newer: (backup: string | null) => string;
}

export interface KeyBinding {
    readonly key: string;
    readonly action: string;
}

export interface CliMessages {
    readonly daemonRunning: (pid: number) => string;
    readonly daemonWedged: (pid: number) => string;
    readonly daemonStarted: (pid: string, log: string) => string;
    readonly offIdle: string;
    readonly offClosing: (pid: number) => string;
    readonly tabUnknown: string;
    readonly modalFailed: (why: string) => string;
    readonly requested: (tab: string) => string;
    readonly compactAsked: string;
    readonly compactNotQueued: (why: string) => string;
    readonly columnToggled: (tab: string) => string;
    readonly columnsToggled: string;
    readonly setupBusy: (command: string) => string;
    readonly backendNow: (what: string) => string;
    readonly usageBackend: (choices: string) => string;
    readonly usage: (commands: string) => string;
    readonly statusVersion: (code: string | null) => string;
    readonly statusRuntime: (path: string, version: string) => string;
    readonly hostRefusal: (refusal: Pick<Refusal, 'found' | 'needed' | 'steps'>, path: string) => string;
    readonly statusKeys: (bindings: readonly KeyBinding[], configPath: string) => string;
    readonly statusDaemon: (pid: number | null, off: boolean, version: string | null) => string;
    readonly statusBackend: (what: string) => string;
    readonly statusLanguage: 'language' | 'idioma  ';
    readonly statusSources: LanguageSourceNames;
    readonly statusExtensions: (ids: string) => string;
    readonly statusState: string;
    readonly statusConfig: string;
    readonly handoff: Readonly<Record<HandoffMessageKey, string>>;
    readonly none: string;
}

export interface Catalog {
    readonly locale: Locale;
    readonly badge: BadgeMessages;
    readonly waitingForAgent: Text;
    readonly fromScreen: Text;
    readonly recapTitle: Text;
    readonly taskNumber: (n: Count) => Text;
    readonly updating: Text;
    readonly daemonStale: (daemon: Text | null) => Text;
    readonly claudeOwn: Text;
    readonly noRecapYet: Text;
    readonly noRecapShort: Text;
    readonly autocompactSettings: AutocompactSettingsMessages;
    readonly git: GitMessages;
    readonly recapError: (error: Text) => Text;
    readonly needsYou: (what: Text) => Text;
    readonly ago: (amount: Count, unit: AgoUnit) => Text;
    readonly hints: HintMessages;
    readonly setup: SetupMessages;
    readonly compaction: CompactionMessages;
    readonly expanded: ExpandedMessages;
    readonly chapters: ChaptersMessages;
    readonly database: DatabaseMessages;
    readonly cli: CliMessages;
}
