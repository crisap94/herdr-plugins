import { BACKEND_IDS, LEGACY_MODEL_KEYS } from '#src/recap/domain/backend.ts';
import type { Draft, FieldId, Locks, Setup } from './setup-state.ts';
import { FIELDS } from './setup-state.ts';

const LOCK_KEYS: Readonly<Record<FieldId, readonly string[]>> = {
    harness: ['TAB_RECAP_BACKEND'],
    model: ['TAB_RECAP_MODEL', ...BACKEND_IDS.map((id) => `TAB_RECAP_MODEL_${id.toUpperCase()}`), ...LEGACY_MODEL_KEYS],
    locale: ['TAB_RECAP_LOCALE'],
    recapLanguage: ['TAB_RECAP_RECAP_LANG'],
    screenAgents: ['TAB_RECAP_SCREEN_AGENTS'],
    gitNote: ['TAB_RECAP_GIT_NOTE'],
    effort: ['TAB_RECAP_EFFORT'],
    compactBy: ['TAB_RECAP_COMPACT_BY'],
    compactModel: ['TAB_RECAP_COMPACT_MODEL'],
    compactEffort: ['TAB_RECAP_COMPACT_EFFORT'],
    judgeBy: ['TAB_RECAP_JUDGE_BY'],
    judgeModel: ['TAB_RECAP_JUDGE_MODEL'],
    judgeEffort: ['TAB_RECAP_JUDGE_EFFORT'],
    curateBy: ['TAB_RECAP_CURATE_BY'],
    curateModel: ['TAB_RECAP_CURATE_MODEL'],
    curateEffort: ['TAB_RECAP_CURATE_EFFORT'],
    compactTarget: ['TAB_RECAP_COMPACT_TARGET'],
    compactNote: ['TAB_RECAP_COMPACT_NOTE'],
    compactHint: ['TAB_RECAP_COMPACT_HINT'],
    contextWindow: ['TAB_RECAP_CONTEXT_WINDOW'],
    autocompact: ['TAB_RECAP_AUTOCOMPACT'],
    autocompactAt: ['TAB_RECAP_AUTOCOMPACT_AT'],
    autocompactStyle: ['TAB_RECAP_AUTOCOMPACT_STYLE'],
    decideBy: ['TAB_RECAP_AUTOCOMPACT_BY'],
    decideModel: ['TAB_RECAP_AUTOCOMPACT_MODEL'],
    decideEffort: ['TAB_RECAP_AUTOCOMPACT_EFFORT'],
    herdrEvents: ['TAB_RECAP_HERDR_EVENTS'],
};

export function locksOf(env: Readonly<Record<string, string | undefined>>): Locks {
    const locks: Partial<Record<FieldId, string>> = {};
    for (const row of FIELDS) {
        const found = LOCK_KEYS[row].find((key) => (env[key] ?? '') !== '');
        if (found !== undefined) {
            locks[row] = found;
        }
    }
    return locks;
}

type Entry = readonly [FieldId, string, string];

const jobs = (by: FieldId, model: FieldId, effort: FieldId, prefix: string, job: Pick<Draft['compact'], 'model' | 'effort'> & { readonly by: string }): readonly Entry[] => [[by, `${prefix}_BY`, job.by], [model, `${prefix}_MODEL`, job.model], [effort, `${prefix}_EFFORT`, job.effort]];


function entriesOf(draft: Draft): readonly Entry[] {
    return [
        ['harness', 'TAB_RECAP_BACKEND', draft.backend],
        ...BACKEND_IDS.map((id): readonly [FieldId, string, string] => ['model', `TAB_RECAP_MODEL_${id.toUpperCase()}`, draft.models[id]]),
        ['locale', 'TAB_RECAP_LOCALE', draft.locale], ['recapLanguage', 'TAB_RECAP_RECAP_LANG', draft.recapLanguage], ['screenAgents', 'TAB_RECAP_SCREEN_AGENTS', draft.screenAgents],
        ['gitNote', 'TAB_RECAP_GIT_NOTE', draft.gitNote], ['effort', 'TAB_RECAP_EFFORT', draft.effort], ['compactTarget', 'TAB_RECAP_COMPACT_TARGET', draft.compactTarget],
        ['compactNote', 'TAB_RECAP_COMPACT_NOTE', draft.compactNote],
        ['compactHint', 'TAB_RECAP_COMPACT_HINT', draft.compactHint], ['contextWindow', 'TAB_RECAP_CONTEXT_WINDOW', draft.contextWindow],
        ['autocompact', 'TAB_RECAP_AUTOCOMPACT', draft.autocompact], ['autocompactAt', 'TAB_RECAP_AUTOCOMPACT_AT', draft.autocompactAt], ['autocompactStyle', 'TAB_RECAP_AUTOCOMPACT_STYLE', draft.autocompactStyle],
        ['herdrEvents', 'TAB_RECAP_HERDR_EVENTS', draft.herdrEvents],
        ...jobs('compactBy', 'compactModel', 'compactEffort', 'TAB_RECAP_COMPACT', draft.compact),
        ...jobs('judgeBy', 'judgeModel', 'judgeEffort', 'TAB_RECAP_JUDGE', draft.judge),
        ...jobs('curateBy', 'curateModel', 'curateEffort', 'TAB_RECAP_CURATE', draft.curate),
        ...jobs('decideBy', 'decideModel', 'decideEffort', 'TAB_RECAP_AUTOCOMPACT', draft.decide),
    ];
}

export function changes(state: Setup): ReadonlyMap<string, string> {
    const was = new Map(entriesOf(state.stored).map(([, key, value]) => [key, value]));
    return new Map(entriesOf(state.draft).flatMap(([row, key, now]): [string, string][] => (now !== was.get(key) && state.locks[row] === undefined ? [[key, now]] : [])));
}

export const dirty = (state: Setup): boolean => changes(state).size > 0;
