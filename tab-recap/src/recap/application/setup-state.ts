// The settings modal's state: what is being chosen, which rows are locked, and the pure reads of it.
import { languageSetting } from '#src/i18n/index.ts';
import { BACKEND_IDS, pick } from '#src/recap/domain/backend.ts';
import { EFFORTS, effortOf } from '#src/recap/domain/effort.ts';
import type { Effort } from '#src/recap/domain/effort.ts';
import { hintSetting, targetSetting, windowSetting } from '#src/recap/domain/compaction.ts';
import { compactJobOf, curateJobOf, JOB_BY_CHOICES, judgeJobOf } from '#src/recap/domain/job.ts';
import type { Job, JobBy } from '#src/recap/domain/job.ts';
import { screenSetting } from '#src/recap/domain/policy.ts';
import type { BackendChoice, BackendId } from '#src/recap/domain/backend.ts';

/** The rows; a job row (`recapJob`, `compactJob`) holds three fields — harness · model · effort — and `part` says which one is focused. */
export type RowId = 'recapJob' | 'compactJob' | 'judgeJob' | 'curatorJob' | 'locale' | 'recapLanguage' | 'screenAgents' | 'gitNote' | 'compactTarget' | 'compactHint' | 'contextWindow';
export const ROWS: readonly RowId[] = ['recapJob', 'compactJob', 'locale', 'recapLanguage', 'screenAgents', 'gitNote', 'compactTarget', 'compactHint', 'contextWindow', 'judgeJob', 'curatorJob'];
/** What can be edited and locked: every row that is not a job, and each part of a job. */
export type FieldId = Exclude<RowId, 'recapJob' | 'compactJob' | 'judgeJob' | 'curatorJob'> | 'harness' | 'model' | 'effort' | 'compactBy' | 'compactModel' | 'compactEffort' | 'judgeBy' | 'judgeModel' | 'judgeEffort' | 'curateBy' | 'curateModel' | 'curateEffort';
export const JOB_FIELDS: Readonly<Partial<Record<RowId, readonly FieldId[]>>> = {
    recapJob: ['harness', 'model', 'effort'],
    compactJob: ['compactBy', 'compactModel', 'compactEffort'],
    judgeJob: ['judgeBy', 'judgeModel', 'judgeEffort'],
    curatorJob: ['curateBy', 'curateModel', 'curateEffort'],
};
export const FIELDS: readonly FieldId[] = ROWS.flatMap((row) => JOB_FIELDS[row] ?? [row as FieldId]);
export const JOB_BY_OPTIONS: readonly JobBy[] = JOB_BY_CHOICES;
export const EFFORT_CHOICES: readonly Effort[] = EFFORTS;
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
    /** how hard the writer thinks (`TAB_RECAP_EFFORT`) */
    readonly effort: Effort;
    /** the compaction brief's job (`TAB_RECAP_COMPACT_BY`, `_MODEL`, `_EFFORT`) */
    readonly compact: Job;
    /** the judge's job (`TAB_RECAP_JUDGE_BY`, `_MODEL`, `_EFFORT`) */
    readonly judge: Job;
    /** the curator's job (`TAB_RECAP_CURATE_BY`, `_MODEL`, `_EFFORT`) */
    readonly curate: Job;
    /** which agents compaction reaches, as stored: `focused`, `all` or a comma list of kinds (`TAB_RECAP_COMPACT_TARGET`) */
    readonly compactTarget: string;
    /** the context share that shows the hint, as stored: `off` or 10–95 (`TAB_RECAP_COMPACT_HINT`) */
    readonly compactHint: string;
    /** the tokens a Claude agent can hold, as stored (`TAB_RECAP_CONTEXT_WINDOW`) */
    readonly contextWindow: string;
}

/** Rows whose value an environment variable overrides: row -> the variable's name. */
export type Locks = Readonly<Partial<Record<FieldId, string>>>;

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
    /** which field of a job row is focused: 0 harness, 1 model, 2 effort */
    readonly part: number;
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
export function draftFrom(config: Pick<Draft, 'backend' | 'models'>, raw: { readonly locale: string | undefined; readonly recapLanguage: string | undefined; readonly screenAgents?: string | undefined; readonly gitNote?: string | undefined; readonly effort?: string | undefined; readonly compactTarget?: string | undefined; readonly compactHint?: string | undefined; readonly contextWindow?: string | undefined; readonly compactBy?: string | undefined; readonly compactModel?: string | undefined; readonly compactEffort?: string | undefined; readonly judgeBy?: string | undefined; readonly judgeModel?: string | undefined; readonly judgeEffort?: string | undefined; readonly curateBy?: string | undefined; readonly curateModel?: string | undefined; readonly curateEffort?: string | undefined }): Draft {
    const locale = LOCALE_CHOICES.find((choice) => choice === raw.locale) ?? 'auto';
    const gitNote = raw.gitNote?.trim().toLowerCase() === 'off' ? 'off' : 'on';
    return { ...config, locale, recapLanguage: languageSetting(raw.recapLanguage), screenAgents: screenSetting(raw.screenAgents), gitNote, effort: effortOf(raw.effort), compactTarget: targetSetting(raw.compactTarget), compactHint: hintSetting(raw.compactHint), contextWindow: windowSetting(raw.contextWindow), compact: compactJobOf((key) => ({ TAB_RECAP_COMPACT_BY: raw.compactBy, TAB_RECAP_COMPACT_MODEL: raw.compactModel, TAB_RECAP_COMPACT_EFFORT: raw.compactEffort })[key]), judge: judgeJobOf((key) => ({ TAB_RECAP_JUDGE_BY: raw.judgeBy, TAB_RECAP_JUDGE_MODEL: raw.judgeModel, TAB_RECAP_JUDGE_EFFORT: raw.judgeEffort })[key]), curate: curateJobOf((key) => ({ TAB_RECAP_CURATE_BY: raw.curateBy, TAB_RECAP_CURATE_MODEL: raw.curateModel, TAB_RECAP_CURATE_EFFORT: raw.curateEffort })[key]) };
}

export function initial(draft: Draft, locks: Locks): Setup {
    return { draft, stored: draft, locks, available: null, row: 0, part: 0, editing: null, test: { kind: 'idle' }, note: null, asked: false };
}

export const rowOf = (state: Setup): RowId => ROWS[state.row] ?? 'recapJob';

/** The field the cursor is on: a job row's focused part, else the row itself. */
export const fieldOf = (state: Setup): FieldId => {
    const row = rowOf(state);
    return JOB_FIELDS[row]?.[state.part] ?? (row as FieldId);
};

/** The harness whose model the Model row edits: the one named, else what `auto` would pick; null = none yet. */
export function modelTarget(draft: Draft, available: readonly string[] | null): BackendId | null {
    return draft.backend === 'custom' ? null : pick(draft.backend, available ?? []);
}
