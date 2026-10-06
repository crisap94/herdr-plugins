// What the modal writes: the lock table (row -> environment variables) and the config.env entries a draft changes.
// A new setup row adds its lock keys and its entry here.
import { BACKEND_IDS } from '#src/recap/domain/backend.ts';
import type { Locks, RowId, Setup } from './setup-state.ts';
import { ROWS } from './setup-state.ts';

const LOCK_KEYS: Readonly<Record<RowId, readonly string[]>> = {
    harness: ['TAB_RECAP_BACKEND'],
    model: ['TAB_RECAP_MODEL', ...BACKEND_IDS.map((id) => `TAB_RECAP_MODEL_${id.toUpperCase()}`), 'TAB_RECAP_CLAUDE_MODEL', 'TAB_RECAP_CODEX_MODEL'],
    locale: ['TAB_RECAP_LOCALE'],
    recapLanguage: ['TAB_RECAP_RECAP_LANG'],
    screenAgents: ['TAB_RECAP_SCREEN_AGENTS'],
    gitNote: ['TAB_RECAP_GIT_NOTE'],
    effort: ['TAB_RECAP_EFFORT'],
};

/** A row an environment variable overrides cannot be changed from the file; the row names the variable. */
export function locksOf(env: Readonly<Record<string, string | undefined>>): Locks {
    const locks: Partial<Record<RowId, string>> = {};
    for (const row of ROWS) {
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
    const set = (row: RowId, key: string, now: string, was: string): void => {
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
    return out;
}

export const dirty = (state: Setup): boolean => changes(state).size > 0;
