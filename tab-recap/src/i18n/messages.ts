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
    readonly queued: (agent: Text | null, clock: Text) => Text;
    readonly briefing: (agent: Text | null, writer: Text | null, clock: Text) => Text;
    readonly compacting: (agent: Text | null, clock: Text) => Text;
    readonly restoring: (agent: Text | null) => Text;
    readonly compacted: (agent: Text | null, figures: Text) => Text;
    readonly template: Text;
    readonly failed: (agent: Text | null, why: Text | null) => Text;
    readonly unconfirmed: (agent: Text | null, why: Text | null) => Text;
    readonly skipped: (agent: Text | null, why: Text | null) => Text;
    readonly restarted: Text;
    readonly selfFailed: Text;
    readonly tokens: (before: Text, after: Text) => Text;
    readonly took: (seconds: Count) => Text;
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
    readonly operator: (count: Count) => Text;
    readonly auto: (count: Count) => Text;
}

export interface CausesMessages { readonly 'turn-ended': Text; readonly focused: Text; readonly requested: Text }

export interface ExpandedAutocompactMessages {
    readonly label: Text;
    readonly text: (decisions: Count, compacted: Count, waited: Count) => Text;
}

export interface ExpandedMessages {
    readonly timeline: Text; readonly rules: Text; readonly session: Text; readonly story: Text; readonly updatingStory: Text;
    readonly waiting: (amount: Count, unit: AgoUnit) => Text;
    readonly closed: (why: ClosedWhy) => Text;
    readonly started: Text; readonly turns: Text; readonly compactions: Text; readonly compactionOrigin: CompactionOriginMessages; readonly of: Text; readonly repo: Text; readonly branch: Text; readonly files: Text;
    readonly causes: CausesMessages;
    readonly autocompact: ExpandedAutocompactMessages;
}

export interface ChaptersMessages {
    readonly label: Text;
    readonly count: (chapters: Count) => Text;
    readonly compacted: Text;
    readonly newSession: Text;
    readonly seconds: (seconds: Count) => Text;
    readonly minutes: (minutes: Count, seconds: Count) => Text;
}

export interface DatabaseMessages {
    readonly newer: (backup: Text | null) => Text;
}

export interface KeyBinding {
    readonly key: Text;
    readonly action: Text;
}

export interface CliMessages {
    readonly daemonRunning: (pid: number) => Text;
    readonly daemonWedged: (pid: number) => Text;
    readonly daemonStarted: (pid: Text, log: Text) => Text;
    readonly offIdle: Text;
    readonly offClosing: (pid: number) => Text;
    readonly tabUnknown: Text;
    readonly modalFailed: (why: Text) => Text;
    readonly requested: (tab: Text) => Text;
    readonly compactAsked: Text;
    readonly compactNotQueued: (why: Text) => Text;
    readonly columnToggled: (tab: Text) => Text;
    readonly columnsToggled: Text;
    readonly setupBusy: (command: Text) => Text;
    readonly backendNow: (what: Text) => Text;
    readonly usageBackend: (choices: Text) => Text;
    readonly usage: (commands: Text) => Text;
    readonly statusVersion: (code: Text | null) => Text;
    readonly statusRuntime: (path: Text, version: Text) => Text;
    readonly hostRefusal: (refusal: Pick<Refusal, 'found' | 'needed' | 'steps'>, path: Text) => Text;
    readonly statusKeys: (bindings: readonly KeyBinding[], configPath: Text) => Text;
    readonly statusDaemon: (pid: number | null, off: Presence, version: Text | null) => Text;
    readonly statusBackend: (what: Text) => Text;
    readonly statusLanguage: 'language' | 'idioma  ';
    readonly statusSources: LanguageSourceNames;
    readonly statusExtensions: (ids: Text) => Text;
    readonly statusState: Text;
    readonly statusConfig: Text;
    readonly handoff: Readonly<Record<HandoffMessageKey, Text>>;
    readonly none: Text;
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
