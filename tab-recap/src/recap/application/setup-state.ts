// The settings modal's state: what is being chosen, which rows are locked, and the pure reads of it.
import { languageSetting } from '#src/i18n/index.ts';
import { BACKEND_IDS, pick } from '#src/recap/domain/backend.ts';
import { screenSetting } from '#src/recap/domain/policy.ts';
import type { BackendChoice, BackendId } from '#src/recap/domain/backend.ts';

export type RowId = 'harness' | 'model' | 'locale' | 'recapLanguage' | 'screenAgents' | 'gitNote';
export const ROWS: readonly RowId[] = ['harness', 'model', 'locale', 'recapLanguage', 'screenAgents', 'gitNote'];
export type LocaleSetting = 'auto' | 'en' | 'es';
export const HARNESS_CHOICES: readonly BackendChoice[] = ['auto', ...BACKEND_IDS];
export const LOCALE_CHOICES: readonly LocaleSetting[] = ['auto', 'en', 'es'];
export type SwitchSetting = 'on' | 'off';
export const SWITCH_CHOICES: readonly SwitchSetting[] = ['on', 'off'];

/** What the operator is choosing. */
export interface Draft {
    readonly backend: BackendChoice;
    readonly models: Readonly<Record<BackendId, string>>;
    readonly locale: LocaleSetting;
    /** `ui`, `en`, `es` or free text, as stored */
    readonly recapLanguage: string;
    /** the agent kinds read from their screen, as stored: `` (none), `all` or a comma list */
    readonly screenAgents: string;
    /** the git note under each lane (`TAB_RECAP_GIT_NOTE`) */
    readonly gitNote: SwitchSetting;
}

/** Rows whose value an environment variable overrides: row -> the variable's name. */
export type Locks = Readonly<Partial<Record<RowId, string>>>;

export type TestState =
    | { readonly kind: 'idle' }
    | { readonly kind: 'running' }
    | { readonly kind: 'ok'; readonly seconds: number; readonly costUsd: number }
    | { readonly kind: 'failed'; readonly why: string };

export type Editing =
    | { readonly kind: 'text'; readonly buffer: string }
    | { readonly kind: 'choice'; readonly at: number };

export type Note = 'locked' | 'unsaved' | 'saved' | 'rewriting' | 'nothing' | 'no-agent' | { readonly failed: string };

export interface Setup {
    readonly draft: Draft;
    readonly stored: Draft;
    readonly locks: Locks;
    /** null while herdr and the PATH are still being asked */
    readonly available: readonly string[] | null;
    readonly row: number;
    readonly editing: Editing | null;
    readonly test: TestState;
    readonly note: Note | null;
    /** the operator pressed q with unsaved changes once already */
    readonly asked: boolean;
}

export type Effect =
    | { readonly kind: 'save'; readonly values: ReadonlyMap<string, string>; readonly languageChanged: boolean }
    | { readonly kind: 'test'; readonly draft: Draft; readonly available: readonly string[] }
    | { readonly kind: 'close' };

export interface Stepped {
    readonly state: Setup;
    readonly effects: readonly Effect[];
}

/** The settings as they are now: the resolved configuration plus the raw locale settings. */
export function draftFrom(config: Pick<Draft, 'backend' | 'models'>, raw: { readonly locale: string | undefined; readonly recapLanguage: string | undefined; readonly screenAgents?: string | undefined; readonly gitNote?: string | undefined }): Draft {
    const locale = LOCALE_CHOICES.find((choice) => choice === raw.locale) ?? 'auto';
    const gitNote = raw.gitNote?.trim().toLowerCase() === 'off' ? 'off' : 'on';
    return { ...config, locale, recapLanguage: languageSetting(raw.recapLanguage), screenAgents: screenSetting(raw.screenAgents), gitNote };
}

export function initial(draft: Draft, locks: Locks): Setup {
    return { draft, stored: draft, locks, available: null, row: 0, editing: null, test: { kind: 'idle' }, note: null, asked: false };
}

export const rowOf = (state: Setup): RowId => ROWS[state.row] ?? 'harness';

/** The harness whose model the Model row edits: the one named, else what `auto` would pick; null = none yet. */
export function modelTarget(draft: Draft, available: readonly string[] | null): BackendId | null {
    return draft.backend === 'custom' ? null : pick(draft.backend, available ?? []);
}
