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

export interface ToggleChoices { readonly on: Text; readonly off: Text }

export interface LegendMessages { readonly current: Text; readonly available: Text; readonly missing: Text }

export interface UiChoicesMessages { readonly auto: Text; readonly en: Text; readonly es: Text }

export interface EffortChoicesMessages { readonly low: Text; readonly medium: Text; readonly high: Text; readonly default: Text }

export interface CompactNoteChoicesMessages {
    readonly ask: Text;
    readonly skip: Text;
}

export interface AutocompactChoicesMessages { readonly off: Text; readonly shadow: Text; readonly on: Text }

export interface AutocompactStyleChoicesMessages {
    readonly gentle: Text;
    readonly balanced: Text;
    readonly eager: Text;
}

export type LanguageNamesMessages = {
    readonly en: Text;
    readonly es: Text;
};

export interface SetupTestMessages {
    readonly running: Text;
    readonly ok: (seconds: Text, cost: Text) => Text;
    readonly failed: (why: Text) => Text;
}

export interface SetupMessages {
    readonly title: Text;
    readonly rows: Readonly<Record<'recapJob' | 'compactJob' | 'judgeJob' | 'curatorJob' | 'locale' | 'recapLanguage' | 'screenAgents' | 'gitNote' | 'telemetryTags' | 'compactTarget' | 'compactNote' | 'compactHint' | 'contextWindow' | 'autocompact' | 'autocompactAt' | 'autocompactStyle' | 'autocompactMissed' | 'autocompactJob' | 'herdrEvents', Text>>;
    readonly loading: Text;
    readonly auto: (order: Text) => Text;
    readonly custom: Text;
    readonly legend: LegendMessages;
    readonly locked: (name: Text) => Text;
    readonly modelDefault: (model: Text) => Text;
    readonly modelNoAgent: Text;
    readonly uiChoices: UiChoicesMessages;
    readonly gitNoteChoices: ToggleChoices;
    readonly herdrEventsChoices: ToggleChoices;
    readonly telemetryTagsChoices: ToggleChoices;
    readonly herdrEventsHint: Text;
    readonly effortChoices: EffortChoicesMessages;
    readonly recapLanguageHint: Text;
    readonly screenAgentsHint: Text;
    readonly compactTargetHint: Text;
    readonly compactNoteChoices: CompactNoteChoicesMessages;
    readonly compactNoteHint: Text;
    readonly compactHintHint: Text;
    readonly compactHintOff: Text;
    readonly modelsHeading: Text;
    readonly jobBy: Readonly<Record<DeciderBy, Text>>;
    readonly jobByChoices: Readonly<Record<DeciderBy, Text>>;
    readonly compactModelSame: Text;
    readonly compactJobHint: Text;
    readonly autocompactChoices: AutocompactChoicesMessages;
    readonly autocompactHint: Text;
    readonly autocompactAtHint: Text;
    readonly autocompactStyleChoices: AutocompactStyleChoicesMessages;
    readonly autocompactStyleHint: Text;
    readonly autocompactMissedChoices: Readonly<Record<MissedFacts, Text>>;
    readonly autocompactMissedHint: Text;
    readonly autocompactJobHint: Text;
    readonly deciderOff: Text;
    readonly judgeJobHint: Text;
    readonly judgeOffChoice: Text;
    readonly curateJobHint: Text;
    readonly curateOff: Text;
    readonly contextWindowHint: Text;
    readonly contextWindowDetected: Text;
    readonly screenNone: Text;
    readonly screenAll: Text;
    readonly languageNames: LanguageNamesMessages;
    readonly sameAsInterface: (language: Text) => Text;
    readonly editHint: Text;
    readonly unsaved: Text;
    readonly saved: Text;
    readonly nothingToSave: Text;
    readonly saveFailed: (why: Text) => Text;
    readonly rewriting: Text;
    readonly test: SetupTestMessages;
    readonly keys: readonly Text[];
    readonly editKeys: readonly Text[];
}

export interface CompactionFigures {
    readonly tokens: Text;
    readonly took: Text;
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
    readonly title: (agent: Text) => Text;
    readonly noteLabel: Text;
    readonly keys: readonly Text[];
    readonly hint: (percent: Count, window: Text) => Text;
    readonly writing: (agent: Text) => Text;
    readonly outcome: (agent: Text, outcome: CompactionOutcome, retried: Presence, figures: CompactionFigures) => Text;
    readonly stage: CompactionStageMessages;
    readonly started: (agent: Text) => Text;
    readonly startedQueued: (agent: Text) => Text;
    readonly auto: (text: Text) => Text;
    readonly coverageMissed: (agent: Text) => Text;
    readonly coverageCeiling: (count: Count) => Text;
    readonly coverageUnchecked: Readonly<Record<UncheckedReason, Text>>;
    readonly coveragePassed: Text;
    readonly skipped: (agent: Text, status: Text) => Text;
    readonly joined: (agent: Text, noted: Presence) => Text;
    readonly nothing: Text;
    readonly failed: (agent: Text, why: Text) => Text;
    readonly laneClosed: (agent: Text | null, pane: Text, point: ClosePoint) => Text;
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
