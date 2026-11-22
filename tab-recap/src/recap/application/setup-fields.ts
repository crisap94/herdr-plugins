import { languageSettingOf } from '#src/i18n/index.ts';
import { MINIMUM_DEFAULT, parseAutocompactPercent } from '#src/recap/domain/autocompact.ts';
import { hintSetting, targetSetting, windowSetting } from '#src/recap/domain/compaction.ts';
import { screenSetting } from '#src/recap/domain/policy.ts';
import { COMPACT_NOTE_CHOICES } from '#src/recap/domain/compact-note.ts';
import { DECIDER_BY_OPTIONS, EFFORT_CHOICES, HARNESS_CHOICES, JOB_BY_OPTIONS, LOCALE_CHOICES, MODE_CHOICES, STYLE_CHOICES, SWITCH_CHOICES, MISSED_CHOICES } from './setup-state.ts';
import type { Draft, FieldId } from './setup-state.ts';
import { textOf } from '#src/recap/domain/text.ts';

export interface ChoiceField {
    readonly size: number;
    readonly at: (draft: Draft) => number;
    readonly keep: (draft: Draft, at: number) => Draft;
}

export interface TextField {
    readonly read: (draft: Draft) => string;
    readonly keep: (draft: Draft, typed: string) => Draft;
}

function choice<T>(options: readonly T[], read: (draft: Draft) => T, write: (draft: Draft, value: T) => Draft): ChoiceField {
    return { size: options.length, at: (draft) => options.indexOf(read(draft)), keep: (draft, at) => { const value = options[at]; return value === undefined ? draft : write(draft, value); } };
}

export const CHOICES: Readonly<Partial<Record<FieldId, ChoiceField>>> = {
    harness: choice(HARNESS_CHOICES, (draft) => draft.backend, (draft, backend): Draft => ({ ...draft, backend })),
    locale: choice(LOCALE_CHOICES, (draft) => draft.locale, (draft, locale): Draft => ({ ...draft, locale })),
    gitNote: choice(SWITCH_CHOICES, (draft) => draft.gitNote, (draft, gitNote): Draft => ({ ...draft, gitNote })),
    telemetryTags: choice(SWITCH_CHOICES, (draft) => draft.telemetryTags, (draft, telemetryTags): Draft => ({ ...draft, telemetryTags })),
    effort: choice(EFFORT_CHOICES, (draft) => draft.effort, (draft, effort): Draft => ({ ...draft, effort })),
    compactBy: choice(JOB_BY_OPTIONS, (draft) => draft.compact.by, (draft, by): Draft => ({ ...draft, compact: { ...draft.compact, by } })),
    compactEffort: choice(EFFORT_CHOICES, (draft) => draft.compact.effort, (draft, effort): Draft => ({ ...draft, compact: { ...draft.compact, effort } })),
    judgeBy: choice(JOB_BY_OPTIONS, (draft) => draft.judge.by, (draft, by): Draft => ({ ...draft, judge: { ...draft.judge, by } })),
    judgeEffort: choice(EFFORT_CHOICES, (draft) => draft.judge.effort, (draft, effort): Draft => ({ ...draft, judge: { ...draft.judge, effort } })),
    curateBy: choice(JOB_BY_OPTIONS, (draft) => draft.curate.by, (draft, by): Draft => ({ ...draft, curate: { ...draft.curate, by } })),
    curateEffort: choice(EFFORT_CHOICES, (draft) => draft.curate.effort, (draft, effort): Draft => ({ ...draft, curate: { ...draft.curate, effort } })),
    autocompact: choice(MODE_CHOICES, (draft) => draft.autocompact, (draft, autocompact): Draft => ({ ...draft, autocompact })),
    autocompactStyle: choice(STYLE_CHOICES, (draft) => draft.autocompactStyle, (draft, autocompactStyle): Draft => ({ ...draft, autocompactStyle })),
    autocompactMissed: choice(MISSED_CHOICES, (draft) => draft.autocompactMissed, (draft, autocompactMissed): Draft => ({ ...draft, autocompactMissed })),
    decideBy: choice(DECIDER_BY_OPTIONS, (draft) => draft.decide.by, (draft, by): Draft => ({ ...draft, decide: { ...draft.decide, by } })),
    herdrEvents: choice(SWITCH_CHOICES, (draft) => draft.herdrEvents, (draft, herdrEvents): Draft => ({ ...draft, herdrEvents })),
    compactNote: choice(COMPACT_NOTE_CHOICES, (draft) => draft.compactNote, (draft, compactNote): Draft => ({ ...draft, compactNote })),
    decideEffort: choice(EFFORT_CHOICES, (draft) => draft.decide.effort, (draft, effort): Draft => ({ ...draft, decide: { ...draft.decide, effort } })),
};

export const TEXTS: Readonly<Partial<Record<FieldId, TextField>>> = {
    recapLanguage: { read: (draft) => draft.recapLanguage, keep: (draft, typed): Draft => ({ ...draft, recapLanguage: languageSettingOf(textOf(typed)) }) },
    screenAgents: { read: (draft) => draft.screenAgents, keep: (draft, typed): Draft => ({ ...draft, screenAgents: screenSetting(textOf(typed)) }) },
    compactTarget: { read: (draft) => draft.compactTarget, keep: (draft, typed): Draft => ({ ...draft, compactTarget: targetSetting(textOf(typed)) }) },
    compactHint: { read: (draft) => draft.compactHint, keep: (draft, typed): Draft => ({ ...draft, compactHint: hintSetting(textOf(typed)) }) },
    contextWindow: { read: (draft) => draft.contextWindow, keep: (draft, typed): Draft => ({ ...draft, contextWindow: windowSetting(textOf(typed)) }) },
    autocompactAt: { read: (draft) => draft.autocompactAt, keep: (draft, typed): Draft => ({ ...draft, autocompactAt: String(parseAutocompactPercent(typed, MINIMUM_DEFAULT)) }) },
    decideModel: { read: (draft) => draft.decide.model, keep: (draft, typed): Draft => ({ ...draft, decide: { ...draft.decide, model: textOf(typed.trim()) } }) },
    compactModel: { read: (draft) => draft.compact.model, keep: (draft, typed): Draft => ({ ...draft, compact: { ...draft.compact, model: textOf(typed.trim()) } }) },
    judgeModel: { read: (draft) => draft.judge.model, keep: (draft, typed): Draft => ({ ...draft, judge: { ...draft.judge, model: textOf(typed.trim()) } }) },
    curateModel: { read: (draft) => draft.curate.model, keep: (draft, typed): Draft => ({ ...draft, curate: { ...draft.curate, model: textOf(typed.trim()) } }) },
};
