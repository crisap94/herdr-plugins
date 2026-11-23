import { knownOr, type GuardedRecapRecords } from '#src/ports/guarded-reads.ts';
import { BACKEND_IDS, environmentName, LEGACY_MODEL_KEYS, type EnvironmentName } from '#src/recap/domain/backend.ts';
import { blankRecap, hasRecap } from '#src/ports/recap-records.ts';
import type { RequestPort } from '#src/ports/requests.ts';
import type { LiveLanes } from '#src/ports/tab-views.ts';
import { tabId, type TabId } from '#src/recap/domain/ids.ts';
import type { DeciderBy, JobBy } from '#src/recap/domain/job.ts';
import type { Draft, DraftState, EnvironmentReader, FieldId, Locks, Setup } from './setup-state.ts';
import { FIELDS } from './setup-state.ts';
import { textOf, type Text } from '#src/recap/domain/text.ts';

const LOCK_KEYS: Readonly<Record<FieldId, readonly EnvironmentName[]>> = {
    harness: [environmentName(textOf('TAB_RECAP_BACKEND'))],
    model: [environmentName(textOf('TAB_RECAP_MODEL')), ...BACKEND_IDS.map((id) => environmentName(textOf(`TAB_RECAP_MODEL_${id.toUpperCase()}`))), ...LEGACY_MODEL_KEYS],
    locale: [],
    recapLanguage: [],
    screenAgents: [environmentName(textOf('TAB_RECAP_SCREEN_AGENTS'))],
    gitNote: [environmentName(textOf('TAB_RECAP_GIT_NOTE'))],
    telemetryTags: [environmentName(textOf('TAB_RECAP_TELEMETRY_TAGS'))],
    effort: [environmentName(textOf('TAB_RECAP_EFFORT'))],
    compactBy: [environmentName(textOf('TAB_RECAP_COMPACT_BY'))],
    compactModel: [environmentName(textOf('TAB_RECAP_COMPACT_MODEL'))],
    compactEffort: [environmentName(textOf('TAB_RECAP_COMPACT_EFFORT'))],
    judgeBy: [environmentName(textOf('TAB_RECAP_JUDGE_BY'))],
    judgeModel: [environmentName(textOf('TAB_RECAP_JUDGE_MODEL'))],
    judgeEffort: [environmentName(textOf('TAB_RECAP_JUDGE_EFFORT'))],
    curateBy: [environmentName(textOf('TAB_RECAP_CURATE_BY'))],
    curateModel: [environmentName(textOf('TAB_RECAP_CURATE_MODEL'))],
    curateEffort: [environmentName(textOf('TAB_RECAP_CURATE_EFFORT'))],
    compactTarget: [environmentName(textOf('TAB_RECAP_COMPACT_TARGET'))],
    compactNote: [environmentName(textOf('TAB_RECAP_COMPACT_NOTE'))],
    compactHint: [environmentName(textOf('TAB_RECAP_COMPACT_HINT'))],
    contextWindow: [environmentName(textOf('TAB_RECAP_CONTEXT_WINDOW'))],
    autocompact: [environmentName(textOf('TAB_RECAP_AUTOCOMPACT'))],
    autocompactAt: [environmentName(textOf('TAB_RECAP_AUTOCOMPACT_AT'))],
    autocompactStyle: [environmentName(textOf('TAB_RECAP_AUTOCOMPACT_STYLE'))],
    autocompactMissed: [environmentName(textOf('TAB_RECAP_AUTOCOMPACT_MISSED_FACTS'))],
    decideBy: [environmentName(textOf('TAB_RECAP_AUTOCOMPACT_BY'))],
    decideModel: [environmentName(textOf('TAB_RECAP_AUTOCOMPACT_MODEL'))],
    decideEffort: [environmentName(textOf('TAB_RECAP_AUTOCOMPACT_EFFORT'))],
    herdrEvents: [environmentName(textOf('TAB_RECAP_HERDR_EVENTS'))],
};

export function locksOf(read: EnvironmentReader): Locks {
    const locks: Partial<Record<FieldId, EnvironmentName>> = {};
    for (const row of FIELDS) {
        const found = LOCK_KEYS[row].find((key) => (read(key) ?? '') !== '');
        if (found !== undefined) {
            locks[row] = found;
        }
    }
    return locks;
}

type Entry = readonly [FieldId, EnvironmentName, Text];

type JobSettings = Pick<Draft['compact'], 'model' | 'effort'> & { readonly by: JobBy | DeciderBy };

const entry = (field: FieldId, key: Text, value: Text): Entry => [field, environmentName(key), value];

const jobs = (by: FieldId, model: FieldId, effort: FieldId, prefix: Text, job: JobSettings): readonly Entry[] => [entry(by, textOf(`${prefix}_BY`), textOf(job.by)), entry(model, textOf(`${prefix}_MODEL`), job.model), entry(effort, textOf(`${prefix}_EFFORT`), textOf(job.effort))];

export function entriesOf(draft: Draft): readonly Entry[] {
    return [
        entry('harness', textOf('TAB_RECAP_BACKEND'), textOf(draft.backend)),
        ...BACKEND_IDS.map((id): Entry => entry('model', textOf(`TAB_RECAP_MODEL_${id.toUpperCase()}`), draft.models[id])),
        entry('locale', textOf('TAB_RECAP_LOCALE'), textOf(draft.locale)), entry('recapLanguage', textOf('TAB_RECAP_RECAP_LANG'), draft.recapLanguage), entry('screenAgents', textOf('TAB_RECAP_SCREEN_AGENTS'), draft.screenAgents),
        entry('gitNote', textOf('TAB_RECAP_GIT_NOTE'), textOf(draft.gitNote)), entry('telemetryTags', textOf('TAB_RECAP_TELEMETRY_TAGS'), textOf(draft.telemetryTags)), entry('effort', textOf('TAB_RECAP_EFFORT'), textOf(draft.effort)), entry('compactTarget', textOf('TAB_RECAP_COMPACT_TARGET'), draft.compactTarget),
        entry('compactNote', textOf('TAB_RECAP_COMPACT_NOTE'), textOf(draft.compactNote)),
        entry('compactHint', textOf('TAB_RECAP_COMPACT_HINT'), draft.compactHint), entry('contextWindow', textOf('TAB_RECAP_CONTEXT_WINDOW'), draft.contextWindow),
        entry('autocompact', textOf('TAB_RECAP_AUTOCOMPACT'), textOf(draft.autocompact)), entry('autocompactAt', textOf('TAB_RECAP_AUTOCOMPACT_AT'), draft.autocompactAt), entry('autocompactStyle', textOf('TAB_RECAP_AUTOCOMPACT_STYLE'), textOf(draft.autocompactStyle)), entry('autocompactMissed', textOf('TAB_RECAP_AUTOCOMPACT_MISSED_FACTS'), textOf(draft.autocompactMissed)),
        entry('herdrEvents', textOf('TAB_RECAP_HERDR_EVENTS'), textOf(draft.herdrEvents)),
        ...jobs('compactBy', 'compactModel', 'compactEffort', textOf('TAB_RECAP_COMPACT'), draft.compact),
        ...jobs('judgeBy', 'judgeModel', 'judgeEffort', textOf('TAB_RECAP_JUDGE'), draft.judge),
        ...jobs('curateBy', 'curateModel', 'curateEffort', textOf('TAB_RECAP_CURATE'), draft.curate),
        ...jobs('decideBy', 'decideModel', 'decideEffort', textOf('TAB_RECAP_AUTOCOMPACT'), draft.decide),
    ];
}

export function changes(state: Setup): ReadonlyMap<EnvironmentName, Text> {
    const was = new Map(entriesOf(state.stored).map(([, key, value]) => [key, value]));
    return new Map(entriesOf(state.draft).flatMap(([row, key, now]): [EnvironmentName, Text][] => (now !== was.get(key) && state.locks[row] === undefined ? [[key, now]] : [])));
}

export const dirty = (state: Setup): DraftState => (changes(state).size > 0 ? 'dirty' : 'clean');

export interface RewriteStore {
    readonly views: LiveLanes;
    readonly records: GuardedRecapRecords;
    readonly requests: RequestPort;
}

export function requestRewrites(opener: TabId | null, store: RewriteStore): readonly TabId[] {
    const live = store.views.liveLanes();
    const seen = live.kind === 'read' ? live.lanes.map((lane) => lane.tab) : [];
    const tabs = [...new Set([...(opener === null ? [] : [opener]), ...seen])]
        .filter((tab) => tab === opener || hasRecap(knownOr(store.records.readRecap(tabId(textOf(String(tab)))), null) ?? blankRecap(tabId(textOf(String(tab))))));
    tabs.forEach((tab) => { store.requests.request(tab); });
    return tabs;
}
