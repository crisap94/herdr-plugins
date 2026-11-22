import { BACKEND_IDS, hasModel } from '#src/recap/domain/backend.ts';
import type { BackendId } from '#src/recap/domain/backend.ts';
import { entriesOf } from '#src/recap/application/setup-changes.ts';
import { CHOICES, TEXTS } from '#src/recap/application/setup-fields.ts';
import { draftFrom, FIELDS } from '#src/recap/application/setup-state.ts';
import type { Draft, FieldId, Locks } from '#src/recap/application/setup-state.ts';

export type SettingKind = 'choice' | 'text' | 'number';

export interface SettingView {
    readonly id: string;
    readonly env: string;
    readonly kind: SettingKind;
    readonly value: string;
    readonly options: readonly string[];
    readonly locked: boolean;
}

export interface Rejected {
    readonly id: string;
    readonly why: 'unknown' | 'locked';
}

export interface Applied {
    readonly draft: Draft;
    readonly rejected: readonly Rejected[];
}

const NUMBER_FIELDS: ReadonlySet<FieldId> = new Set<FieldId>(['compactTarget', 'compactHint', 'contextWindow', 'autocompactAt']);
const MODEL_PREFIX = 'model.';

const RAW_KEYS = {
    locale: 'TAB_RECAP_LOCALE', recapLanguage: 'TAB_RECAP_RECAP_LANG', screenAgents: 'TAB_RECAP_SCREEN_AGENTS', gitNote: 'TAB_RECAP_GIT_NOTE',
    telemetryTags: 'TAB_RECAP_TELEMETRY_TAGS', effort: 'TAB_RECAP_EFFORT', compactTarget: 'TAB_RECAP_COMPACT_TARGET', compactHint: 'TAB_RECAP_COMPACT_HINT',
    contextWindow: 'TAB_RECAP_CONTEXT_WINDOW', compactBy: 'TAB_RECAP_COMPACT_BY', compactModel: 'TAB_RECAP_COMPACT_MODEL', compactEffort: 'TAB_RECAP_COMPACT_EFFORT',
    judgeBy: 'TAB_RECAP_JUDGE_BY', judgeModel: 'TAB_RECAP_JUDGE_MODEL', judgeEffort: 'TAB_RECAP_JUDGE_EFFORT', curateBy: 'TAB_RECAP_CURATE_BY',
    curateModel: 'TAB_RECAP_CURATE_MODEL', curateEffort: 'TAB_RECAP_CURATE_EFFORT', autocompact: 'TAB_RECAP_AUTOCOMPACT', autocompactAt: 'TAB_RECAP_AUTOCOMPACT_AT',
    autocompactStyle: 'TAB_RECAP_AUTOCOMPACT_STYLE', autocompactMissed: 'TAB_RECAP_AUTOCOMPACT_MISSED_FACTS', decideBy: 'TAB_RECAP_AUTOCOMPACT_BY',
    decideModel: 'TAB_RECAP_AUTOCOMPACT_MODEL', decideEffort: 'TAB_RECAP_AUTOCOMPACT_EFFORT', herdrEvents: 'TAB_RECAP_HERDR_EVENTS', compactNote: 'TAB_RECAP_COMPACT_NOTE',
} as const;

export type RawSettings = Parameters<typeof draftFrom>[1];

export const rawSettingsFrom = (get: (key: string) => string | undefined): RawSettings => {
    const raw = (field: keyof typeof RAW_KEYS): string | undefined => get(RAW_KEYS[field]);
    return {
        locale: raw('locale'), recapLanguage: raw('recapLanguage'), screenAgents: raw('screenAgents'), gitNote: raw('gitNote'), telemetryTags: raw('telemetryTags'),
        effort: raw('effort'), compactTarget: raw('compactTarget'), compactHint: raw('compactHint'), contextWindow: raw('contextWindow'),
        compactBy: raw('compactBy'), compactModel: raw('compactModel'), compactEffort: raw('compactEffort'), judgeBy: raw('judgeBy'), judgeModel: raw('judgeModel'),
        judgeEffort: raw('judgeEffort'), curateBy: raw('curateBy'), curateModel: raw('curateModel'), curateEffort: raw('curateEffort'), autocompact: raw('autocompact'),
        autocompactAt: raw('autocompactAt'), autocompactStyle: raw('autocompactStyle'), autocompactMissed: raw('autocompactMissed'), decideBy: raw('decideBy'),
        decideModel: raw('decideModel'), decideEffort: raw('decideEffort'), herdrEvents: raw('herdrEvents'), compactNote: raw('compactNote'),
    };
};

export const modelBackends: readonly BackendId[] = BACKEND_IDS.filter(hasModel);

export const settingIds: readonly string[] = FIELDS.flatMap((field) => (field === 'model' ? modelBackends.map((id) => `${MODEL_PREFIX}${id}`) : [field]));

const entryOf = (draft: Draft, field: FieldId, key?: string): readonly [FieldId, string, string] | undefined =>
    entriesOf(draft).find(([each, name]) => each === field && (key === undefined || name === key));

const modelKey = (id: BackendId): string => `TAB_RECAP_MODEL_${id.toUpperCase()}`;

const backendOfModel = (id: string): BackendId | undefined => modelBackends.find((backend) => `${MODEL_PREFIX}${backend}` === id);

function kindOf(field: FieldId, chosen: boolean): SettingKind {
    if (chosen) {
        return 'choice';
    }
    return NUMBER_FIELDS.has(field) ? 'number' : 'text';
}

function viewOf(draft: Draft, locks: Locks, id: string): SettingView | undefined {
    const backend = backendOfModel(id);
    if (backend !== undefined) {
        const entry = entryOf(draft, 'model', modelKey(backend));
        return entry === undefined ? undefined : { id, env: entry[1], kind: 'text', value: entry[2], options: [], locked: locks.model !== undefined };
    }
    const field = FIELDS.find((each) => each === id);
    const entry = field === undefined ? undefined : entryOf(draft, field);
    if (field === undefined || entry === undefined) {
        return undefined;
    }
    const choice = CHOICES[field];
    const options = choice === undefined ? [] : Array.from({ length: choice.size }, (_, at) => entryOf(choice.keep(draft, at), field)?.[2] ?? '');
    const kind = kindOf(field, choice !== undefined);
    return { id, env: entry[1], kind, value: entry[2], options, locked: locks[field] !== undefined };
}

export const settingsOf = (draft: Draft, locks: Locks): readonly SettingView[] => settingIds.flatMap((id) => viewOf(draft, locks, id) ?? []);

function withValue(draft: Draft, id: string, value: string): Draft | undefined {
    const backend = backendOfModel(id);
    if (backend !== undefined) {
        return { ...draft, models: { ...draft.models, [backend]: value.trim() } };
    }
    const field = FIELDS.find((each) => each === id);
    const choice = field === undefined ? undefined : CHOICES[field];
    if (field === undefined) {
        return undefined;
    }
    if (choice !== undefined) {
        const at = Array.from({ length: choice.size }, (_, index) => entryOf(choice.keep(draft, index), field)?.[2]).indexOf(value);
        return at < 0 ? undefined : choice.keep(draft, at);
    }
    return TEXTS[field]?.keep(draft, value);
}

export function apply(draft: Draft, locks: Locks, assignments: ReadonlyMap<string, string>): Applied {
    let next = draft;
    const rejected: Rejected[] = [];
    for (const [id, value] of assignments) {
        const field = backendOfModel(id) === undefined ? FIELDS.find((each) => each === id) : 'model';
        const changed = field === undefined || locks[field] !== undefined ? undefined : withValue(next, id, value);
        if (changed === undefined) {
            rejected.push({ id, why: field !== undefined && locks[field] !== undefined ? 'locked' : 'unknown' });
        } else {
            next = changed;
        }
    }
    return { draft: next, rejected };
}
