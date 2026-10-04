// The settings modal as a pure reducer: (state, key) -> (state, effects). It never touches the
// terminal, the config file or a harness; src/setup/main.ts performs the effects.
import { languageSetting } from '#src/i18n/index.ts';
import { BACKEND_IDS, pick } from '#src/recap/domain/backend.ts';
import type { BackendChoice, BackendId } from '#src/recap/domain/backend.ts';

export type RowId = 'harness' | 'model' | 'words' | 'locale' | 'recapLanguage';
export const ROWS: readonly RowId[] = ['harness', 'model', 'words', 'locale', 'recapLanguage'];
export type LocaleSetting = 'auto' | 'en' | 'es';
export const HARNESS_CHOICES: readonly BackendChoice[] = ['auto', ...BACKEND_IDS];
export const LOCALE_CHOICES: readonly LocaleSetting[] = ['auto', 'en', 'es'];
export const WORDS_RANGE = { min: 50, max: 2000 } as const;

/** What the operator is choosing. */
export interface Draft {
    readonly backend: BackendChoice;
    readonly models: Readonly<Record<BackendId, string>>;
    readonly words: number;
    readonly locale: LocaleSetting;
    /** `ui`, `en`, `es` or free text, as stored */
    readonly recapLanguage: string;
}

/** Rows whose value an environment variable overrides: row -> the variable's name. */
export type Locks = Readonly<Partial<Record<RowId, string>>>;

export type TestState =
    | { readonly kind: 'idle' }
    | { readonly kind: 'running' }
    | { readonly kind: 'ok'; readonly seconds: number; readonly costUsd: number }
    | { readonly kind: 'failed'; readonly why: string };

export type Editing =
    | { readonly kind: 'text'; readonly buffer: string }
    | { readonly kind: 'choice'; readonly at: number };

export type Note = 'locked' | 'unsaved' | 'saved' | 'rewriting' | 'nothing' | 'invalid' | 'no-agent' | { readonly failed: string };

export interface Setup {
    readonly draft: Draft;
    readonly stored: Draft;
    readonly locks: Locks;
    /** null while herdr and the PATH are still being asked */
    readonly available: readonly string[] | null;
    readonly row: number;
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

const ESC = String.fromCodePoint(0x1b);
const UP = new Set(['k', `${ESC}[A`, `${ESC}OA`]);
const DOWN = new Set(['j', `${ESC}[B`, `${ESC}OB`]);

/** The settings as they are now: the resolved configuration plus the raw words/locale settings. */
export function draftFrom(config: Pick<Draft, 'backend' | 'models' | 'words'>, raw: { readonly locale: string | undefined; readonly recapLanguage: string | undefined }): Draft {
    const locale = LOCALE_CHOICES.find((choice) => choice === raw.locale) ?? 'auto';
    return { ...config, locale, recapLanguage: languageSetting(raw.recapLanguage) };
}

const LOCK_KEYS: Readonly<Record<RowId, readonly string[]>> = {
    harness: ['TAB_RECAP_BACKEND'],
    model: ['TAB_RECAP_MODEL', ...BACKEND_IDS.map((id) => `TAB_RECAP_MODEL_${id.toUpperCase()}`), 'TAB_RECAP_CLAUDE_MODEL', 'TAB_RECAP_CODEX_MODEL'],
    words: ['TAB_RECAP_WORDS'],
    locale: ['TAB_RECAP_LOCALE'],
    recapLanguage: ['TAB_RECAP_RECAP_LANG'],
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

export function initial(draft: Draft, locks: Locks): Setup {
    return { draft, stored: draft, locks, available: null, row: 0, editing: null, test: { kind: 'idle' }, note: null, asked: false };
}

export const rowOf = (state: Setup): RowId => ROWS[state.row] ?? 'harness';

export const dirty = (state: Setup): boolean => changes(state).size > 0;

/** The harness whose model the Model row edits: the one named, else what `auto` would pick; null = none yet. */
export function modelTarget(draft: Draft, available: readonly string[] | null): BackendId | null {
    return draft.backend === 'custom' ? null : pick(draft.backend, available ?? []);
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
    set('words', 'TAB_RECAP_WORDS', String(draft.words), String(stored.words));
    set('locale', 'TAB_RECAP_LOCALE', draft.locale, stored.locale);
    set('recapLanguage', 'TAB_RECAP_RECAP_LANG', draft.recapLanguage, stored.recapLanguage);
    return out;
}

function enter(state: Setup): Setup {
    const row = rowOf(state);
    if (state.locks[row] !== undefined) {
        return { ...state, note: 'locked' };
    }
    const { draft } = state;
    const target = modelTarget(draft, state.available);
    if (row === 'harness') {
        return { ...state, note: null, editing: { kind: 'choice', at: HARNESS_CHOICES.indexOf(draft.backend) } };
    }
    if (row === 'locale') {
        return { ...state, note: null, editing: { kind: 'choice', at: LOCALE_CHOICES.indexOf(draft.locale) } };
    }
    if (row === 'model') {
        return target === null ? { ...state, note: 'no-agent' } : { ...state, note: null, editing: { kind: 'text', buffer: draft.models[target] } };
    }
    return { ...state, note: null, editing: { kind: 'text', buffer: row === 'words' ? String(draft.words) : draft.recapLanguage } };
}

function confirmText(state: Setup, buffer: string): Setup {
    const { draft } = state;
    const row = rowOf(state);
    const done = { ...state, editing: null, note: null };
    if (row === 'words') {
        const words = Number(buffer);
        const valid = Number.isInteger(words) && words >= WORDS_RANGE.min && words <= WORDS_RANGE.max;
        return valid ? { ...done, draft: { ...draft, words } } : { ...state, note: 'invalid' };
    }
    if (row === 'recapLanguage') {
        return { ...done, draft: { ...draft, recapLanguage: languageSetting(buffer) } };
    }
    const target = modelTarget(draft, state.available);
    return target === null ? done : { ...done, draft: { ...draft, models: { ...draft.models, [target]: buffer.trim() } } };
}

function confirmChoice(state: Setup, at: number): Setup {
    const done = { ...state, editing: null, note: null };
    if (rowOf(state) === 'harness') {
        const backend = HARNESS_CHOICES[at];
        return backend === undefined ? done : { ...done, draft: { ...state.draft, backend } };
    }
    const locale = LOCALE_CHOICES[at];
    return locale === undefined ? done : { ...done, draft: { ...state.draft, locale } };
}

const isPrintable = (key: string): boolean => !key.startsWith(ESC) && Array.from(key).every((char) => (char.codePointAt(0) ?? 0) >= 0x20 && char !== '\u007f');

function editChoice(state: Setup, at: number, key: string): Setup {
    if (key === '\r') {
        return confirmChoice(state, at);
    }
    const size = rowOf(state) === 'harness' ? HARNESS_CHOICES.length : LOCALE_CHOICES.length;
    const by = (UP.has(key) ? -1 : 0) + (DOWN.has(key) ? 1 : 0);
    return by === 0 ? state : { ...state, editing: { kind: 'choice', at: (at + by + size) % size } };
}

function editText(state: Setup, buffer: string, key: string): Setup {
    const typed = (text: string): Setup => ({ ...state, editing: { kind: 'text', buffer: text }, note: null });
    if (key === '\r') {
        return confirmText(state, buffer);
    }
    if (key === '\u007f' || key === '\b') {
        return typed(Array.from(buffer).slice(0, -1).join(''));
    }
    if (key === '\u0015') {
        return typed('');
    }
    return isPrintable(key) ? typed(buffer + key) : state;
}

function editKey(state: Setup, editing: Editing, key: string): Stepped {
    if (key === ESC || key === '\u0003') {
        return { state: { ...state, editing: null, note: null }, effects: [] };
    }
    const next = editing.kind === 'choice' ? editChoice(state, editing.at, key) : editText(state, editing.buffer, key);
    return { state: next, effects: [] };
}

function leave(state: Setup): Stepped {
    if (dirty(state) && !state.asked) {
        return { state: { ...state, asked: true, note: 'unsaved' }, effects: [] };
    }
    return { state, effects: [{ kind: 'close' }] };
}

function save(state: Setup): Stepped {
    const values = changes(state);
    if (values.size === 0) {
        return { state: { ...state, note: 'nothing' }, effects: [] };
    }
    const languageChanged = values.has('TAB_RECAP_RECAP_LANG') || values.has('TAB_RECAP_LOCALE');
    return { state, effects: [{ kind: 'save', values, languageChanged }] };
}

/** t: one tiny real request through what is selected, unless one is already running. */
function startTest(state: Setup): Stepped {
    if (state.test.kind === 'running') {
        return { state, effects: [] };
    }
    return { state: { ...state, test: { kind: 'running' } }, effects: [{ kind: 'test', draft: state.draft, available: state.available ?? [] }] };
}

function move(state: Setup, by: number): Setup {
    return { ...state, row: Math.min(ROWS.length - 1, Math.max(0, state.row + by)), note: null };
}

const QUIT = new Set(['q', ESC, '\u0003']);

const COMMANDS: Readonly<Record<string, (state: Setup) => Stepped>> = {
    s: save,
    t: startTest,
    '\r': (state) => ({ state: enter(state), effects: [] }),
};

/** One key. `asked` lasts for exactly one key: anything but a second q/Esc takes the question back. */
export function step(state: Setup, key: string): Stepped {
    if (state.editing !== null) {
        return editKey({ ...state, asked: false }, state.editing, key);
    }
    if (QUIT.has(key)) {
        return leave(state);
    }
    const calm: Setup = { ...state, asked: false, note: state.asked ? null : state.note };
    if (UP.has(key) || DOWN.has(key)) {
        return { state: move(calm, UP.has(key) ? -1 : 1), effects: [] };
    }
    return (COMMANDS[key] ?? ((same) => ({ state: same, effects: [] })))(calm);
}

/** herdr and the PATH have answered. */
export const withAvailable = (state: Setup, available: readonly string[]): Setup => ({ ...state, available });

export const tested = (state: Setup, test: TestState): Setup => ({ ...state, test });

/** The file was written (or not). */
export function saved(state: Setup, failure: string | null, rewriting: boolean): Setup {
    return failure === null
        ? { ...state, stored: state.draft, note: rewriting ? 'rewriting' : 'saved', asked: false }
        : { ...state, note: { failed: failure } };
}
