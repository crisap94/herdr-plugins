// The settings modal as a pure reducer: (state, key) -> (state, effects). It never touches the
// terminal, the config file or a harness; src/setup/main.ts performs the effects.
import { languageSetting } from '#src/i18n/index.ts';
import { hintSetting, targetSetting, windowSetting } from '#src/recap/domain/compaction.ts';
import { screenSetting } from '#src/recap/domain/policy.ts';
import { changes, dirty } from './setup-changes.ts';
import { EFFORT_CHOICES, HARNESS_CHOICES, LOCALE_CHOICES, modelTarget, rowOf, ROWS, SWITCH_CHOICES } from './setup-state.ts';
import type { Draft, Editing, RowId, Setup, Stepped, TestState } from './setup-state.ts';

export { changes, dirty, locksOf } from './setup-changes.ts';
export * from './setup-state.ts';

const ESC = String.fromCodePoint(0x1b);
const UP = new Set(['k', `${ESC}[A`, `${ESC}OA`]);
const DOWN = new Set(['j', `${ESC}[B`, `${ESC}OB`]);

/** The rows edited as text (other than the model): what they show to edit, and how a typed value is kept. */
const TEXT_ROWS: Readonly<Partial<Record<RowId, { readonly read: (draft: Draft) => string; readonly keep: (draft: Draft, typed: string) => Draft }>>> = {
    recapLanguage: { read: (draft) => draft.recapLanguage, keep: (draft, typed) => ({ ...draft, recapLanguage: languageSetting(typed) }) },
    screenAgents: { read: (draft) => draft.screenAgents, keep: (draft, typed) => ({ ...draft, screenAgents: screenSetting(typed) }) },
    compactTarget: { read: (draft) => draft.compactTarget, keep: (draft, typed) => ({ ...draft, compactTarget: targetSetting(typed) }) },
    compactHint: { read: (draft) => draft.compactHint, keep: (draft, typed) => ({ ...draft, compactHint: hintSetting(typed) }) },
    contextWindow: { read: (draft) => draft.contextWindow, keep: (draft, typed) => ({ ...draft, contextWindow: windowSetting(typed) }) },
};

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
    if (row === 'gitNote') {
        return { ...state, note: null, editing: { kind: 'choice', at: SWITCH_CHOICES.indexOf(draft.gitNote) } };
    }
    if (row === 'effort') {
        return { ...state, note: null, editing: { kind: 'choice', at: EFFORT_CHOICES.indexOf(draft.effort) } };
    }
    if (row === 'model') {
        return target === null ? { ...state, note: 'no-agent' } : { ...state, note: null, editing: { kind: 'text', buffer: draft.models[target] } };
    }
    return { ...state, note: null, editing: { kind: 'text', buffer: TEXT_ROWS[row]?.read(draft) ?? draft.recapLanguage } };
}

function confirmText(state: Setup, buffer: string): Setup {
    const { draft } = state;
    const row = rowOf(state);
    const done = { ...state, editing: null, note: null };
    const text = TEXT_ROWS[row];
    if (text !== undefined) {
        return { ...done, draft: text.keep(draft, buffer) };
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
    if (rowOf(state) === 'gitNote') {
        const gitNote = SWITCH_CHOICES[at];
        return gitNote === undefined ? done : { ...done, draft: { ...state.draft, gitNote } };
    }
    if (rowOf(state) === 'effort') {
        const effort = EFFORT_CHOICES[at];
        return effort === undefined ? done : { ...done, draft: { ...state.draft, effort } };
    }
    const locale = LOCALE_CHOICES[at];
    return locale === undefined ? done : { ...done, draft: { ...state.draft, locale } };
}

const isPrintable = (key: string): boolean => !key.startsWith(ESC) && Array.from(key).every((char) => (char.codePointAt(0) ?? 0) >= 0x20 && char !== '\u007f');

const CHOICE_COUNTS: Readonly<Partial<Record<RowId, number>>> = { harness: HARNESS_CHOICES.length, locale: LOCALE_CHOICES.length, gitNote: SWITCH_CHOICES.length, effort: EFFORT_CHOICES.length };
const choiceCount = (row: RowId): number => CHOICE_COUNTS[row] ?? 0;

function editChoice(state: Setup, at: number, key: string): Setup {
    if (key === '\r') {
        return confirmChoice(state, at);
    }
    const size = choiceCount(rowOf(state));
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
