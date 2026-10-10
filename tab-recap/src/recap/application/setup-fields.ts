// What each editable field of the settings modal is: a list to choose from, or text to type, and how its value is read from and kept in the draft. Pure.
import { languageSetting } from '#src/i18n/index.ts';
import { minimumOf } from '#src/recap/domain/autocompact.ts';
import { hintSetting, targetSetting, windowSetting } from '#src/recap/domain/compaction.ts';
import { screenSetting } from '#src/recap/domain/policy.ts';
import { DECIDER_BY_OPTIONS, EFFORT_CHOICES, HARNESS_CHOICES, JOB_BY_OPTIONS, LOCALE_CHOICES, MODE_CHOICES, STYLE_CHOICES, SWITCH_CHOICES } from './setup-state.ts';
import type { Draft, FieldId } from './setup-state.ts';

export interface ChoiceField {
    readonly size: number;
    /** the choice the draft has now */
    readonly at: (draft: Draft) => number;
    /** the draft with choice number `at`; unchanged when there is none */
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
    harness: choice(HARNESS_CHOICES, (draft) => draft.backend, (draft, backend) => ({ ...draft, backend })),
    locale: choice(LOCALE_CHOICES, (draft) => draft.locale, (draft, locale) => ({ ...draft, locale })),
    gitNote: choice(SWITCH_CHOICES, (draft) => draft.gitNote, (draft, gitNote) => ({ ...draft, gitNote })),
    effort: choice(EFFORT_CHOICES, (draft) => draft.effort, (draft, effort) => ({ ...draft, effort })),
    compactBy: choice(JOB_BY_OPTIONS, (draft) => draft.compact.by, (draft, by) => ({ ...draft, compact: { ...draft.compact, by } })),
    compactEffort: choice(EFFORT_CHOICES, (draft) => draft.compact.effort, (draft, effort) => ({ ...draft, compact: { ...draft.compact, effort } })),
    judgeBy: choice(JOB_BY_OPTIONS, (draft) => draft.judge.by, (draft, by) => ({ ...draft, judge: { ...draft.judge, by } })),
    judgeEffort: choice(EFFORT_CHOICES, (draft) => draft.judge.effort, (draft, effort) => ({ ...draft, judge: { ...draft.judge, effort } })),
    curateBy: choice(JOB_BY_OPTIONS, (draft) => draft.curate.by, (draft, by) => ({ ...draft, curate: { ...draft.curate, by } })),
    curateEffort: choice(EFFORT_CHOICES, (draft) => draft.curate.effort, (draft, effort) => ({ ...draft, curate: { ...draft.curate, effort } })),
    autocompact: choice(MODE_CHOICES, (draft) => draft.autocompact, (draft, autocompact) => ({ ...draft, autocompact })),
    autocompactStyle: choice(STYLE_CHOICES, (draft) => draft.autocompactStyle, (draft, autocompactStyle) => ({ ...draft, autocompactStyle })),
    decideBy: choice(DECIDER_BY_OPTIONS, (draft) => draft.decide.by, (draft, by) => ({ ...draft, decide: { ...draft.decide, by } })),
    herdrEvents: choice(SWITCH_CHOICES, (draft) => draft.herdrEvents, (draft, herdrEvents) => ({ ...draft, herdrEvents })),
    decideEffort: choice(EFFORT_CHOICES, (draft) => draft.decide.effort, (draft, effort) => ({ ...draft, decide: { ...draft.decide, effort } })),
};

/** The fields typed as text (other than the recap writer's model, which belongs to the harness in force). */
export const TEXTS: Readonly<Partial<Record<FieldId, TextField>>> = {
    recapLanguage: { read: (draft) => draft.recapLanguage, keep: (draft, typed) => ({ ...draft, recapLanguage: languageSetting(typed) }) },
    screenAgents: { read: (draft) => draft.screenAgents, keep: (draft, typed) => ({ ...draft, screenAgents: screenSetting(typed) }) },
    compactTarget: { read: (draft) => draft.compactTarget, keep: (draft, typed) => ({ ...draft, compactTarget: targetSetting(typed) }) },
    compactHint: { read: (draft) => draft.compactHint, keep: (draft, typed) => ({ ...draft, compactHint: hintSetting(typed) }) },
    contextWindow: { read: (draft) => draft.contextWindow, keep: (draft, typed) => ({ ...draft, contextWindow: windowSetting(typed) }) },
    autocompactAt: { read: (draft) => draft.autocompactAt, keep: (draft, typed) => ({ ...draft, autocompactAt: String(minimumOf(typed)) }) },
    decideModel: { read: (draft) => draft.decide.model, keep: (draft, typed) => ({ ...draft, decide: { ...draft.decide, model: typed.trim() } }) },
    compactModel: { read: (draft) => draft.compact.model, keep: (draft, typed) => ({ ...draft, compact: { ...draft.compact, model: typed.trim() } }) },
    judgeModel: { read: (draft) => draft.judge.model, keep: (draft, typed) => ({ ...draft, judge: { ...draft.judge, model: typed.trim() } }) },
    curateModel: { read: (draft) => draft.curate.model, keep: (draft, typed) => ({ ...draft, curate: { ...draft.curate, model: typed.trim() } }) },
};
