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
    readonly updating: string;
    readonly claudeOwn: string;
    readonly noRecapYet: string;
    readonly noRecapShort: string;
    readonly recapError: (error: string) => string;
    readonly needsYou: (what: string) => string;
    readonly ago: (amount: number, unit: AgoUnit) => string;
    /** the footer's hints, longest first: the first that fits the width is shown */
    readonly hints: { readonly column: readonly string[]; readonly modal: readonly string[] };
    readonly setup: {
        readonly title: string;
        readonly rows: { readonly harness: string; readonly model: string; readonly locale: string; readonly recapLanguage: string; readonly screenAgents: string };
        readonly loading: string;
        readonly auto: (order: string) => string;
        readonly custom: string;
        readonly legend: { readonly current: string; readonly available: string; readonly missing: string };
        readonly locked: (name: string) => string;
        readonly modelDefault: (model: string) => string;
        readonly modelNoAgent: string;
        readonly uiChoices: { readonly auto: string; readonly en: string; readonly es: string };
        readonly recapLanguageHint: string;
        readonly screenAgentsHint: string;
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
    readonly cli: {
        readonly daemonRunning: (pid: number) => string;
        readonly daemonStarted: (pid: string, log: string) => string;
        readonly offIdle: string;
        readonly offClosing: (pid: number) => string;
        readonly tabUnknown: string;
        readonly modalFailed: (why: string) => string;
        readonly requested: (tab: string) => string;
        readonly columnHidden: (tab: string) => string;
        readonly columnShown: (tab: string) => string;
        readonly columnsHidden: string;
        readonly columnsShown: string;
        readonly setupBusy: (command: string) => string;
        readonly backendNow: (what: string) => string;
        readonly usageBackend: (choices: string) => string;
        readonly usage: (commands: string) => string;
        readonly statusDaemon: (pid: number | null, off: boolean) => string;
        readonly statusBackend: (what: string) => string;
        readonly statusExtensions: (ids: string) => string;
        readonly statusState: string;
        readonly statusConfig: string;
        readonly none: string;
    };
}
