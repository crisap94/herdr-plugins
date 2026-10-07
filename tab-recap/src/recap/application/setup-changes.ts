// What the modal writes: the lock table (row -> environment variables) and the config.env entries a draft changes.
// A new setup row adds its lock keys and its entry here.
import { BACKEND_IDS } from '#src/recap/domain/backend.ts';
import type { FieldId, Locks, Setup } from './setup-state.ts';
import { FIELDS } from './setup-state.ts';

const LOCK_KEYS: Readonly<Record<FieldId, readonly string[]>> = {
    harness: ['TAB_RECAP_BACKEND'],
    model: ['TAB_RECAP_MODEL', ...BACKEND_IDS.map((id) => `TAB_RECAP_MODEL_${id.toUpperCase()}`), 'TAB_RECAP_CLAUDE_MODEL', 'TAB_RECAP_CODEX_MODEL'],
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
    compactHint: ['TAB_RECAP_COMPACT_HINT'],
    contextWindow: ['TAB_RECAP_CONTEXT_WINDOW'],
};

/** A row an environment variable overrides cannot be changed from the file; the row names the variable. */
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

/** The config.env entries that differ from what is stored; a locked row is never written. */
export function changes(state: Setup): ReadonlyMap<string, string> {
    const { draft, stored, locks } = state;
    const out = new Map<string, string>();
    const set = (row: FieldId, key: string, now: string, was: string): void => {
        if (now !== was && locks[row] === undefined) {
            out.set(key, now);
        }
    };
    set('harness', 'TAB_RECAP_BACKEND', draft.backend, stored.backend);
    for (const id of BACKEND_IDS) {
        set('model', `TAB_RECAP_MODEL_${id.toUpperCase()}`, draft.models[id], stored.models[id]);
    }
    set('locale', 'TAB_RECAP_LOCALE', draft.locale, stored.locale);
    set('recapLanguage', 'TAB_RECAP_RECAP_LANG', draft.recapLanguage, stored.recapLanguage);
    set('screenAgents', 'TAB_RECAP_SCREEN_AGENTS', draft.screenAgents, stored.screenAgents);
    set('gitNote', 'TAB_RECAP_GIT_NOTE', draft.gitNote, stored.gitNote);
    set('effort', 'TAB_RECAP_EFFORT', draft.effort, stored.effort);
    set('compactTarget', 'TAB_RECAP_COMPACT_TARGET', draft.compactTarget, stored.compactTarget);
    set('compactHint', 'TAB_RECAP_COMPACT_HINT', draft.compactHint, stored.compactHint);
    set('compactBy', 'TAB_RECAP_COMPACT_BY', draft.compact.by, stored.compact.by);
    set('compactModel', 'TAB_RECAP_COMPACT_MODEL', draft.compact.model, stored.compact.model);
    set('compactEffort', 'TAB_RECAP_COMPACT_EFFORT', draft.compact.effort, stored.compact.effort);
    set('judgeBy', 'TAB_RECAP_JUDGE_BY', draft.judge.by, stored.judge.by);
    set('judgeModel', 'TAB_RECAP_JUDGE_MODEL', draft.judge.model, stored.judge.model);
    set('judgeEffort', 'TAB_RECAP_JUDGE_EFFORT', draft.judge.effort, stored.judge.effort);
    set('curateBy', 'TAB_RECAP_CURATE_BY', draft.curate.by, stored.curate.by);
    set('curateModel', 'TAB_RECAP_CURATE_MODEL', draft.curate.model, stored.curate.model);
    set('curateEffort', 'TAB_RECAP_CURATE_EFFORT', draft.curate.effort, stored.curate.effort);
    set('contextWindow', 'TAB_RECAP_CONTEXT_WINDOW', draft.contextWindow, stored.contextWindow);
    return out;
}

export const dirty = (state: Setup): boolean => changes(state).size > 0;
