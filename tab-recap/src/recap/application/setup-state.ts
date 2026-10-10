import { languageSetting } from '#src/i18n/index.ts';
import { BACKEND_IDS, hasModel, pick } from '#src/recap/domain/backend.ts';
import { EFFORTS, effortOf } from '#src/recap/domain/effort.ts';
import type { Effort } from '#src/recap/domain/effort.ts';
import { hintSetting, targetSetting, windowSetting } from '#src/recap/domain/compaction.ts';
import { modeOf, minimumOf } from '#src/recap/domain/autocompact.ts';
import type { AutocompactMode } from '#src/recap/domain/autocompact.ts';
import { STYLES, styleOf } from '#src/recap/domain/autocompact-style.ts';
import type { AutocompactStyle } from '#src/recap/domain/autocompact-style.ts';
import { compactJobOf, curateJobOf, DECIDER_BY_CHOICES, deciderJobOf, JOB_BY_CHOICES, judgeJobOf } from '#src/recap/domain/job.ts';
import type { DeciderBy, DeciderJob, Job, JobBy } from '#src/recap/domain/job.ts';
import { screenSetting } from '#src/recap/domain/policy.ts';
import type { BackendChoice, BackendId } from '#src/recap/domain/backend.ts';
import { herdrEventsOf } from '#src/recap/domain/herdr-events.ts';
import type { HerdrEvents } from '#src/recap/domain/herdr-events.ts';
import { compactNoteOf } from '#src/recap/domain/compact-note.ts';
import type { CompactNote } from '#src/recap/domain/compact-note.ts';

export type RowId = 'recapJob' | 'compactJob' | 'judgeJob' | 'curatorJob' | 'locale' | 'recapLanguage' | 'screenAgents' | 'gitNote' | 'compactTarget' | 'compactNote' | 'compactHint' | 'contextWindow' | 'autocompact' | 'autocompactAt' | 'autocompactStyle' | 'autocompactJob' | 'herdrEvents';
export const ROWS: readonly RowId[] = ['recapJob', 'compactJob', 'locale', 'recapLanguage', 'screenAgents', 'gitNote', 'compactTarget', 'compactNote', 'compactHint', 'contextWindow', 'judgeJob', 'curatorJob', 'autocompact', 'autocompactAt', 'autocompactStyle', 'autocompactJob', 'herdrEvents'];
export type FieldId = Exclude<RowId, 'recapJob' | 'compactJob' | 'judgeJob' | 'curatorJob' | 'autocompactJob'> | 'harness' | 'model' | 'effort' | 'compactBy' | 'compactModel' | 'compactEffort' | 'judgeBy' | 'judgeModel' | 'judgeEffort' | 'curateBy' | 'curateModel' | 'curateEffort' | 'decideBy' | 'decideModel' | 'decideEffort';
export const JOB_FIELDS: Readonly<Partial<Record<RowId, readonly FieldId[]>>> = {
    recapJob: ['harness', 'model', 'effort'],
    compactJob: ['compactBy', 'compactModel', 'compactEffort'],
    judgeJob: ['judgeBy', 'judgeModel', 'judgeEffort'],
    curatorJob: ['curateBy', 'curateModel', 'curateEffort'],
    autocompactJob: ['decideBy', 'decideModel', 'decideEffort'],
};
export const FIELDS: readonly FieldId[] = ROWS.flatMap((row) => JOB_FIELDS[row] ?? [row as FieldId]);
export const JOB_BY_OPTIONS: readonly JobBy[] = JOB_BY_CHOICES;
export const DECIDER_BY_OPTIONS: readonly DeciderBy[] = DECIDER_BY_CHOICES;
export const MODE_CHOICES: readonly AutocompactMode[] = ['off', 'shadow', 'on'];
export const STYLE_CHOICES: readonly AutocompactStyle[] = STYLES;
export const EFFORT_CHOICES: readonly Effort[] = EFFORTS;
export type LocaleSetting = 'auto' | 'en' | 'es';
export const HARNESS_CHOICES: readonly BackendChoice[] = ['auto', ...BACKEND_IDS];
export const LOCALE_CHOICES: readonly LocaleSetting[] = ['auto', 'en', 'es'];
export type SwitchSetting = 'on' | 'off';
export const SWITCH_CHOICES: readonly SwitchSetting[] = ['on', 'off'];

export interface Draft {
    readonly backend: BackendChoice;
    readonly models: Readonly<Record<BackendId, string>>;
    readonly locale: LocaleSetting;
    readonly recapLanguage: string;
    readonly screenAgents: string;
    readonly gitNote: SwitchSetting;
    readonly effort: Effort;
    readonly compact: Job;
    readonly judge: Job;
    readonly curate: Job;
    readonly autocompact: AutocompactMode;
    readonly autocompactAt: string;
    readonly autocompactStyle: AutocompactStyle;
    readonly decide: DeciderJob;
    readonly compactTarget: string;
    readonly compactNote: CompactNote;
    readonly compactHint: string;
    readonly contextWindow: string;
    readonly herdrEvents: HerdrEvents;
}

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
    readonly available: readonly string[] | null;
    readonly row: number;
    readonly part: number;
    readonly editing: Editing | null;
    readonly test: TestState;
    readonly note: Note | null;
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

export function draftFrom(config: Pick<Draft, 'backend' | 'models'>, raw: { readonly locale: string | undefined; readonly recapLanguage: string | undefined; readonly screenAgents?: string | undefined; readonly gitNote?: string | undefined; readonly effort?: string | undefined; readonly compactTarget?: string | undefined; readonly compactHint?: string | undefined; readonly contextWindow?: string | undefined; readonly compactBy?: string | undefined; readonly compactModel?: string | undefined; readonly compactEffort?: string | undefined; readonly judgeBy?: string | undefined; readonly judgeModel?: string | undefined; readonly judgeEffort?: string | undefined; readonly curateBy?: string | undefined; readonly curateModel?: string | undefined; readonly curateEffort?: string | undefined; readonly autocompact?: string | undefined; readonly autocompactAt?: string | undefined; readonly autocompactStyle?: string | undefined; readonly decideBy?: string | undefined; readonly decideModel?: string | undefined; readonly decideEffort?: string | undefined; readonly herdrEvents?: string | undefined; readonly compactNote?: string | undefined }): Draft {
    const locale = LOCALE_CHOICES.find((choice) => choice === raw.locale) ?? 'auto';
    const gitNote = raw.gitNote?.trim().toLowerCase() === 'off' ? 'off' : 'on';
    return { ...config, herdrEvents: herdrEventsOf(raw.herdrEvents), compactNote: compactNoteOf(raw.compactNote), locale, recapLanguage: languageSetting(raw.recapLanguage), screenAgents: screenSetting(raw.screenAgents), gitNote, effort: effortOf(raw.effort), compactTarget: targetSetting(raw.compactTarget), compactHint: hintSetting(raw.compactHint), contextWindow: windowSetting(raw.contextWindow), compact: compactJobOf((key) => ({ TAB_RECAP_COMPACT_BY: raw.compactBy, TAB_RECAP_COMPACT_MODEL: raw.compactModel, TAB_RECAP_COMPACT_EFFORT: raw.compactEffort })[key]), judge: judgeJobOf((key) => ({ TAB_RECAP_JUDGE_BY: raw.judgeBy, TAB_RECAP_JUDGE_MODEL: raw.judgeModel, TAB_RECAP_JUDGE_EFFORT: raw.judgeEffort })[key]), curate: curateJobOf((key) => ({ TAB_RECAP_CURATE_BY: raw.curateBy, TAB_RECAP_CURATE_MODEL: raw.curateModel, TAB_RECAP_CURATE_EFFORT: raw.curateEffort })[key]), autocompact: modeOf(raw.autocompact), autocompactAt: String(minimumOf(raw.autocompactAt)), autocompactStyle: styleOf(raw.autocompactStyle), decide: deciderJobOf((key) => ({ TAB_RECAP_AUTOCOMPACT_BY: raw.decideBy, TAB_RECAP_AUTOCOMPACT_MODEL: raw.decideModel, TAB_RECAP_AUTOCOMPACT_EFFORT: raw.decideEffort })[key]) };
}

export function initial(draft: Draft, locks: Locks): Setup {
    return { draft, stored: draft, locks, available: null, row: 0, part: 0, editing: null, test: { kind: 'idle' }, note: null, asked: false };
}

export const rowOf = (state: Setup): RowId => ROWS[state.row] ?? 'recapJob';

export const fieldOf = (state: Setup): FieldId => {
    const row = rowOf(state);
    return JOB_FIELDS[row]?.[state.part] ?? (row as FieldId);
};

export function modelTarget(draft: Draft, available: readonly string[] | null): BackendId | null {
    const backend = pick(draft.backend, available ?? []);
    return backend === null || !hasModel(backend) ? null : backend;
}
