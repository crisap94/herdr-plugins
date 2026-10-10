import type { DeciderBy } from '#src/recap/domain/job.ts';
import type { Refusal } from '#src/host/policy.mjs';
import type { ClosedWhy } from '#src/recap/domain/fact.ts';

/** The languages the UI speaks. The recap language is separate: any language, see `recapLanguageOf`. */
export type Locale = 'en' | 'es';

export type AgoUnit = 's' | 'min' | 'h' | 'd';

/** Everything the plugin says to the operator. Pure data and pure functions; `es` must fill every key. */
export interface Messages {
    readonly locale: Locale;
    readonly badge: {
        readonly working: string;
        readonly blocked: string;
        readonly idle: string;
        readonly done: string;
        readonly unknown: string;
    };
    readonly waitingForAgent: string;
    /** beside a lane whose recap is read from its terminal screen, not a transcript */
    readonly fromScreen: string;
    readonly recapTitle: string;
    /** the heading of a task that has no name, when a tab holds several: `Task 2` */
    readonly taskNumber: (n: number) => string;
    readonly updating: string;
    /** the daemon runs another version than the code on disk: `null` is a daemon too old to say */
    readonly daemonStale: (daemon: string | null) => string;
    readonly claudeOwn: string;
    readonly noRecapYet: string;
    readonly noRecapShort: string;
    /** the git note's details: `2 unpushed`, `3 changed` */
    readonly git: { readonly unpushed: (count: number) => string; readonly changed: (count: number) => string };
    readonly recapError: (error: string) => string;
    readonly needsYou: (what: string) => string;
    readonly ago: (amount: number, unit: AgoUnit) => string;
    /** the footer's hints, longest first: the first that fits the width is shown */
    readonly hints: { readonly column: readonly string[]; readonly modal: readonly string[] };
    readonly setup: {
        readonly title: string;
        readonly rows: Readonly<Record<'recapJob' | 'compactJob' | 'judgeJob' | 'curatorJob' | 'locale' | 'recapLanguage' | 'screenAgents' | 'gitNote' | 'compactTarget' | 'compactNote' | 'compactHint' | 'contextWindow' | 'autocompact' | 'autocompactAt' | 'autocompactJob' | 'herdrEvents', string>>;
        readonly loading: string;
        readonly auto: (order: string) => string;
        readonly custom: string;
        readonly legend: { readonly current: string; readonly available: string; readonly missing: string };
        readonly locked: (name: string) => string;
        readonly modelDefault: (model: string) => string;
        readonly modelNoAgent: string;
        readonly uiChoices: { readonly auto: string; readonly en: string; readonly es: string };
        readonly gitNoteChoices: { readonly on: string; readonly off: string };
        readonly herdrEventsChoices: { readonly on: string; readonly off: string };
        readonly herdrEventsHint: string;
        readonly effortChoices: { readonly low: string; readonly medium: string; readonly high: string; readonly default: string };
        readonly recapLanguageHint: string;
        readonly screenAgentsHint: string;
        readonly compactTargetHint: string;
        readonly compactNoteChoices: { readonly ask: string; readonly skip: string };
        readonly compactNoteHint: string;
        readonly compactHintHint: string;
        readonly compactHintOff: string;
        /** the heading over the job rows */
        readonly modelsHeading: string;
        readonly jobBy: Readonly<Record<DeciderBy, string>>;
        readonly jobByChoices: Readonly<Record<DeciderBy, string>>;
        readonly compactModelSame: string;
        readonly compactJobHint: string;
        /** autocompact: the mode's words, and the hints of its three rows */
        readonly autocompactChoices: { readonly off: string; readonly shadow: string; readonly on: string };
        readonly autocompactHint: string;
        readonly autocompactAtHint: string;
        readonly autocompactJobHint: string;
        /** the `off` choice of the decider's harness list */
        readonly deciderOff: string;
        readonly judgeJobHint: string;
        readonly judgeOffChoice: string;
        readonly curateJobHint: string;
        /** the `off` choice of the curator's harness list */
        readonly curateOff: string;
        readonly contextWindowHint: string;
        readonly contextWindowDetected: string;
        readonly screenNone: string;
        readonly screenAll: string;
        readonly languageNames: { readonly en: string; readonly es: string };
        readonly sameAsInterface: (language: string) => string;
        readonly editHint: string;
        readonly unsaved: string;
        readonly saved: string;
        readonly nothingToSave: string;
        readonly saveFailed: (why: string) => string;
        readonly rewriting: string;
        readonly test: {
            readonly running: string;
            readonly ok: (seconds: string, cost: string) => string;
            readonly failed: (why: string) => string;
        };
        /** the footer's hints, longest first */
        readonly keys: readonly string[];
        readonly editKeys: readonly string[];
    };
    /** compaction: the popup that asks for a note, the notices, and the hint beside a lane that is filling up */
    readonly compaction: {
        readonly title: (agent: string) => string;
        readonly noteLabel: string;
        readonly keys: readonly string[];
        /** `window` is the size measured against (`1M`), or '' when it is not worth saying */
        readonly hint: (percent: number, window: string) => string;
        readonly writing: (agent: string) => string;
        /** the toast at the end; `figures` are what the records said (`tokens`: "39.5k → 3.1k tokens", `took`: "16 s"), '' when they said nothing */
        readonly outcome: (agent: string, outcome: 'compacted' | 'failed' | 'unconfirmed', retried: boolean, figures: { readonly tokens: string; readonly took: string }) => string;
        /** the lane's header while a compaction is shown (`agent` is given on the phone's bar, null on the column); no glyph, no colour */
        readonly stage: {
            readonly briefing: (agent: string | null, writer: string | null, clock: string) => string;
            readonly compacting: (agent: string | null, clock: string) => string;
            readonly restoring: (agent: string | null) => string;
            /** `figures`: "39.5k → 3.1k · 16 s", or '' */
            readonly compacted: (agent: string | null, figures: string) => string;
            readonly template: string;
            readonly failed: (agent: string | null, why: string | null) => string;
            readonly unconfirmed: (agent: string | null, why: string | null) => string;
            readonly skipped: (agent: string | null, why: string | null) => string;
            /** why a record left in progress by a daemon that stopped is not confirmed */
            readonly restarted: string;
            /** why a compaction failed when the agent's own records say its summarizer did */
            readonly selfFailed: string;
            /** the tokens as the toast says them */
            readonly tokens: (before: string, after: string) => string;
            /** a duration as words: "16 s" */
            readonly took: (seconds: number) => string;
        };
        readonly started: (agent: string) => string;
        /** a toast of a compaction autocompact started says so: `Compacting claude (auto)` */
        readonly auto: (text: string) => string;
        /** an automatic compaction whose brief still misses a fact that matters is not typed */
        readonly coverageMissed: (agent: string) => string;
        readonly skipped: (agent: string, status: string) => string;
        /** a request for a lane that is already queued or compacting: it joins that compaction, starts none */
        readonly joined: (agent: string) => string;
        readonly nothing: string;
        readonly failed: (agent: string, why: string) => string;
    };
    /** the expanded view: headings the column does not have (`story` heads the curator's paragraph), `waiting 25 min`, `closed: wrong`, the session facts' labels */
    readonly expanded: {
        readonly timeline: string; readonly rules: string; readonly session: string; readonly story: string; readonly updatingStory: string;
        readonly waiting: (amount: number, unit: AgoUnit) => string;
        readonly closed: (why: ClosedWhy) => string;
        readonly started: string; readonly turns: string; readonly compactions: string; readonly compactionOrigin: { readonly operator: (count: number) => string; readonly auto: (count: number) => string }; readonly of: string; readonly repo: string; readonly branch: string; readonly files: string;
        readonly causes: { readonly 'turn-ended': string; readonly focused: string; readonly requested: string };
        /** the session facts' autocompact line: `autocompact: 12 decisions · 3 compacted · 9 waited` */
        readonly autocompact: { readonly label: string; readonly text: (decisions: number, compacted: number, waited: number) => string };
    };
    /** the expanded view's chapters: the session facts' count and the break lines of the timeline */
    readonly chapters: {
        readonly label: string;
        readonly count: (chapters: number) => string;
        readonly compacted: string;
        readonly newSession: string;
        readonly seconds: (seconds: number) => string;
        readonly minutes: (minutes: number, seconds: number) => string;
    };
    /** the database was written by a newer plugin: `backup` is the copy to restore, when there is one */
    readonly database: { readonly newer: (backup: string | null) => string };
    readonly cli: {
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
        readonly statusNode: (path: string, version: string) => string;
        /** several lines: what is wrong (the version found, the one required, the `node` that ran) and the steps to fix it on this OS */
        readonly hostRefusal: (refusal: Pick<Refusal, 'found' | 'needed' | 'steps'>, path: string) => string;
        readonly statusKeys: (bindings: readonly { readonly key: string; readonly action: string }[], configPath: string) => string;
        readonly statusDaemon: (pid: number | null, off: boolean, version: string | null) => string;
        readonly statusBackend: (what: string) => string;
        readonly statusExtensions: (ids: string) => string;
        readonly statusState: string;
        readonly statusConfig: string;
        readonly none: string;
    };
}
