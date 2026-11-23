import { languageSettingOf } from '#src/i18n/index.ts';
import { BACKEND_IDS, hasModel, pick } from '#src/recap/domain/backend.ts';
import { EFFORTS, effortOf } from '#src/recap/domain/effort.ts';
import type { Effort } from '#src/recap/domain/effort.ts';
import { hintSetting, targetSetting, windowSetting } from '#src/recap/domain/compaction.ts';
import { MINIMUM_DEFAULT, MISSED_FACTS, parseAutocompactMode, parseAutocompactPercent, parseMissedFacts } from '#src/recap/domain/autocompact.ts';
import type { AutocompactMode, MissedFacts } from '#src/recap/domain/autocompact.ts';
import { STYLES, styleOf } from '#src/recap/domain/autocompact-style.ts';
import type { AutocompactStyle } from '#src/recap/domain/autocompact-style.ts';
import { compactSettingOf, curateSettingOf, DECIDER_BY_CHOICES, deciderSettingOf, JOB_BY_CHOICES, judgeSettingOf } from '#src/recap/domain/job.ts';
import type { DeciderBy, DeciderSetting, JobBy, JobSetting } from '#src/recap/domain/job.ts';
import { screenSetting } from '#src/recap/domain/policy.ts';
import type { BackendChoice, BackendId, EnvironmentName } from '#src/recap/domain/backend.ts';
import { herdrEventsFrom } from '#src/recap/domain/herdr-events.ts';
import type { HerdrEvents } from '#src/recap/domain/herdr-events.ts';
import { telemetryTagsOf } from '#src/recap/domain/telemetry-tags.ts';
import type { TelemetryTags } from '#src/recap/domain/telemetry-tags.ts';
import { compactNoteOf } from '#src/recap/domain/compact-note.ts';
import type { CompactNote } from '#src/recap/domain/compact-note.ts';
import { countOf, type Count } from '#src/recap/domain/count.ts';
import type { AgentKind } from '#src/recap/domain/ids.ts';
import type { Usd } from '#src/recap/domain/usd.ts';
import { textOf, type Text } from '#src/recap/domain/text.ts';

export type RowId = 'recapJob' | 'compactJob' | 'judgeJob' | 'curatorJob' | 'locale' | 'recapLanguage' | 'screenAgents' | 'gitNote' | 'telemetryTags' | 'compactTarget' | 'compactNote' | 'compactHint' | 'contextWindow' | 'autocompact' | 'autocompactAt' | 'autocompactStyle' | 'autocompactMissed' | 'autocompactJob' | 'herdrEvents';
export const ROWS: readonly RowId[] = ['recapJob', 'compactJob', 'locale', 'recapLanguage', 'screenAgents', 'gitNote', 'compactTarget', 'compactNote', 'compactHint', 'contextWindow', 'judgeJob', 'curatorJob', 'autocompact', 'autocompactAt', 'autocompactStyle', 'autocompactMissed', 'autocompactJob', 'herdrEvents', 'telemetryTags'];
type JobRow = 'recapJob' | 'compactJob' | 'judgeJob' | 'curatorJob' | 'autocompactJob';
type PlainRow = Exclude<RowId, JobRow>;
export type FieldId = PlainRow | 'harness' | 'model' | 'effort' | 'compactBy' | 'compactModel' | 'compactEffort' | 'judgeBy' | 'judgeModel' | 'judgeEffort' | 'curateBy' | 'curateModel' | 'curateEffort' | 'decideBy' | 'decideModel' | 'decideEffort';
export const JOB_FIELDS: Readonly<Partial<Record<RowId, readonly FieldId[]>>> = {
    recapJob: ['harness', 'model', 'effort'],
    compactJob: ['compactBy', 'compactModel', 'compactEffort'],
    judgeJob: ['judgeBy', 'judgeModel', 'judgeEffort'],
    curatorJob: ['curateBy', 'curateModel', 'curateEffort'],
    autocompactJob: ['decideBy', 'decideModel', 'decideEffort'],
};
const isPlainRow = (row: RowId): row is PlainRow => JOB_FIELDS[row] === undefined;
export const FIELDS: readonly FieldId[] = ROWS.flatMap((row) => JOB_FIELDS[row] ?? (isPlainRow(row) ? [row] : []));
export const JOB_BY_OPTIONS: readonly JobBy[] = JOB_BY_CHOICES;
export const DECIDER_BY_OPTIONS: readonly DeciderBy[] = DECIDER_BY_CHOICES;
export const MODE_CHOICES: readonly AutocompactMode[] = ['off', 'shadow', 'on'];
export const STYLE_CHOICES: readonly AutocompactStyle[] = STYLES;
export const MISSED_CHOICES: readonly MissedFacts[] = MISSED_FACTS;
export const EFFORT_CHOICES: readonly Effort[] = EFFORTS;
export type LocaleSetting = 'auto' | 'en' | 'es';
export const HARNESS_CHOICES: readonly BackendChoice[] = ['auto', ...BACKEND_IDS];
export const LOCALE_CHOICES: readonly LocaleSetting[] = ['auto', 'en', 'es'];
export type SwitchSetting = 'on' | 'off';
export const SWITCH_CHOICES: readonly SwitchSetting[] = ['on', 'off'];

export interface Draft {
    readonly backend: BackendChoice;
    readonly models: Readonly<Record<BackendId, Text>>;
    readonly locale: LocaleSetting;
    readonly recapLanguage: Text;
    readonly screenAgents: Text;
    readonly gitNote: SwitchSetting;
    readonly telemetryTags: TelemetryTags;
    readonly effort: Effort;
    readonly compact: JobSetting;
    readonly judge: JobSetting;
    readonly curate: JobSetting;
    readonly autocompact: AutocompactMode;
    readonly autocompactAt: Text;
    readonly autocompactStyle: AutocompactStyle;
    readonly autocompactMissed: MissedFacts;
    readonly decide: DeciderSetting;
    readonly compactTarget: Text;
    readonly compactNote: CompactNote;
    readonly compactHint: Text;
    readonly contextWindow: Text;
    readonly herdrEvents: HerdrEvents;
}

export type Locks = Readonly<Partial<Record<FieldId, EnvironmentName>>>;

export type TestState =
    | { readonly kind: 'idle' }
    | { readonly kind: 'running' }
    | { readonly kind: 'ok'; readonly seconds: Count; readonly costUsd: Usd }
    | { readonly kind: 'failed'; readonly why: Text };

interface TextEdit { readonly kind: 'text'; readonly buffer: Text }

interface ChoiceEdit { readonly kind: 'choice'; readonly at: Count }

export type Editing = TextEdit | ChoiceEdit;

interface FailedNote { readonly failed: Text }

export type Note = 'locked' | 'unsaved' | 'saved' | 'rewriting' | 'nothing' | 'no-agent' | FailedNote;

export interface Setup {
    readonly draft: Draft;
    readonly stored: Draft;
    readonly locks: Locks;
    readonly available: readonly AgentKind[] | null;
    readonly row: Count;
    readonly part: Count;
    readonly editing: Editing | null;
    readonly test: TestState;
    readonly note: Note | null;
    readonly asked: boolean;
}

export interface SaveEffect {
    readonly kind: 'save';
    readonly values: ReadonlyMap<EnvironmentName, Text>;
    readonly languageChanged: boolean;
}

export interface TestEffect {
    readonly kind: 'test';
    readonly draft: Draft;
    readonly available: readonly AgentKind[];
}

export interface CloseEffect {
    readonly kind: 'close';
}

export type Effect = SaveEffect | TestEffect | CloseEffect;

export interface Stepped {
    readonly state: Setup;
    readonly effects: readonly Effect[];
}

interface RawSettings {
    readonly locale: Text | undefined;
    readonly recapLanguage: Text | undefined;
    readonly screenAgents?: Text | undefined;
    readonly gitNote?: Text | undefined;
    readonly telemetryTags?: Text | undefined;
    readonly effort?: Text | undefined;
    readonly compactTarget?: Text | undefined;
    readonly compactHint?: Text | undefined;
    readonly contextWindow?: Text | undefined;
    readonly compactBy?: Text | undefined;
    readonly compactModel?: Text | undefined;
    readonly compactEffort?: Text | undefined;
    readonly judgeBy?: Text | undefined;
    readonly judgeModel?: Text | undefined;
    readonly judgeEffort?: Text | undefined;
    readonly curateBy?: Text | undefined;
    readonly curateModel?: Text | undefined;
    readonly curateEffort?: Text | undefined;
    readonly autocompact?: Text | undefined;
    readonly autocompactAt?: Text | undefined;
    readonly autocompactStyle?: Text | undefined;
    readonly autocompactMissed?: Text | undefined;
    readonly decideBy?: Text | undefined;
    readonly decideModel?: Text | undefined;
    readonly decideEffort?: Text | undefined;
    readonly herdrEvents?: Text | undefined;
    readonly compactNote?: Text | undefined;
}

function recapLanguageSettingOf(raw: RawSettings): Text {
    return languageSettingOf(raw.recapLanguage);
}

export function draftFrom(config: Pick<Draft, 'backend' | 'models'>, raw: RawSettings): Draft {
    const locale = LOCALE_CHOICES.find((choice) => choice === raw.locale) ?? 'auto';
    const gitNote = raw.gitNote?.trim().toLowerCase() === 'off' ? 'off' : 'on';
    const telemetryTags = telemetryTagsOf(raw.telemetryTags);
    return { ...config, telemetryTags, herdrEvents: herdrEventsFrom(raw.herdrEvents), compactNote: compactNoteOf(raw.compactNote), locale, recapLanguage: recapLanguageSettingOf(raw), screenAgents: screenSetting(raw.screenAgents), gitNote, effort: effortOf(raw.effort), compactTarget: targetSetting(raw.compactTarget), compactHint: hintSetting(raw.compactHint), contextWindow: windowSetting(raw.contextWindow), compact: compactSettingOf((key) => { const value = new Map(Object.entries({ TAB_RECAP_COMPACT_BY: raw.compactBy, TAB_RECAP_COMPACT_MODEL: raw.compactModel, TAB_RECAP_COMPACT_EFFORT: raw.compactEffort })).get(key); return value; }), judge: judgeSettingOf((key) => { const value = new Map(Object.entries({ TAB_RECAP_JUDGE_BY: raw.judgeBy, TAB_RECAP_JUDGE_MODEL: raw.judgeModel, TAB_RECAP_JUDGE_EFFORT: raw.judgeEffort })).get(key); return value; }), curate: curateSettingOf((key) => { const value = new Map(Object.entries({ TAB_RECAP_CURATE_BY: raw.curateBy, TAB_RECAP_CURATE_MODEL: raw.curateModel, TAB_RECAP_CURATE_EFFORT: raw.curateEffort })).get(key); return value; }), autocompact: parseAutocompactMode(raw.autocompact), autocompactAt: textOf(String(parseAutocompactPercent(raw.autocompactAt, MINIMUM_DEFAULT))), autocompactStyle: styleOf(raw.autocompactStyle), autocompactMissed: parseMissedFacts(raw.autocompactMissed), decide: deciderSettingOf((key) => { const value = new Map(Object.entries({ TAB_RECAP_AUTOCOMPACT_BY: raw.decideBy, TAB_RECAP_AUTOCOMPACT_MODEL: raw.decideModel, TAB_RECAP_AUTOCOMPACT_EFFORT: raw.decideEffort })).get(key); return value; }) };
}

export function initial(draft: Draft, locks: Locks): Setup {
    return { draft, stored: draft, locks, available: null, row: countOf(0), part: countOf(0), editing: null, test: { kind: 'idle' }, note: null, asked: false };
}

export const rowOf = (state: Setup): RowId => ROWS[state.row] ?? 'recapJob';

export const fieldOf = (state: Setup): FieldId => {
    const row = rowOf(state);
    return isPlainRow(row) ? row : (JOB_FIELDS[row]?.[state.part] ?? 'harness');
};

export function modelTarget(draft: Draft, available: readonly AgentKind[] | null): BackendId | null {
    const backend = pick(draft.backend, (available ?? []).map((name) => textOf(name)));
    return backend === null || !hasModel(backend) ? null : backend;
}
