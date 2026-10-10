import { changes, dirty } from './setup-changes.ts';
import { CHOICES, TEXTS } from './setup-fields.ts';
import { fieldOf, JOB_FIELDS, modelTarget, rowOf, ROWS } from './setup-state.ts';
import type { Editing, FieldId, Setup, Stepped, TestState } from './setup-state.ts';

export { changes, dirty, locksOf } from './setup-changes.ts';
export * from './setup-state.ts';

const ESC = String.fromCodePoint(0x1b);
const UP = new Set(['k', `${ESC}[A`, `${ESC}OA`]);
const DOWN = new Set(['j', `${ESC}[B`, `${ESC}OB`]);
const LEFT = new Set(['h', `${ESC}[D`, `${ESC}OD`]);
const RIGHT = new Set(['l', `${ESC}[C`, `${ESC}OC`]);

function enter(state: Setup): Setup {
    const field = fieldOf(state);
    if (state.locks[field] !== undefined) {
        return { ...state, note: 'locked' };
    }
    const { draft } = state;
    const choice = CHOICES[field];
    if (choice !== undefined) {
        return { ...state, note: null, editing: { kind: 'choice', at: choice.at(draft) } };
    }
    const target = modelTarget(draft, state.available);
    if (field === 'model') {
        return target === null ? { ...state, note: 'no-agent' } : { ...state, note: null, editing: { kind: 'text', buffer: draft.models[target] } };
    }
    return { ...state, note: null, editing: { kind: 'text', buffer: TEXTS[field]?.read(draft) ?? draft.recapLanguage } };
}

function confirmText(state: Setup, buffer: string): Setup {
    const { draft } = state;
    const row = fieldOf(state);
    const done = { ...state, editing: null, note: null };
    const text = TEXTS[row];
    if (text !== undefined) {
        return { ...done, draft: text.keep(draft, buffer) };
    }
    const target = modelTarget(draft, state.available);
    return target === null ? done : { ...done, draft: { ...draft, models: { ...draft.models, [target]: buffer.trim() } } };
}

function confirmChoice(state: Setup, at: number): Setup {
    const done = { ...state, editing: null, note: null };
    const choice = CHOICES[fieldOf(state)];
    return choice === undefined ? done : { ...done, draft: choice.keep(state.draft, at) };
}

const isPrintable = (key: string): boolean => !key.startsWith(ESC) && Array.from(key).every((char) => (char.codePointAt(0) ?? 0) >= 0x20 && char !== '\u007f');

const choiceCount = (field: FieldId): number => CHOICES[field]?.size ?? 0;

function editChoice(state: Setup, at: number, key: string): Setup {
    if (key === '\r') {
        return confirmChoice(state, at);
    }
    const size = choiceCount(fieldOf(state));
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

function startTest(state: Setup): Stepped {
    if (state.test.kind === 'running') {
        return { state, effects: [] };
    }
    return { state: { ...state, test: { kind: 'running' } }, effects: [{ kind: 'test', draft: state.draft, available: state.available ?? [] }] };
}

function move(state: Setup, by: number): Setup {
    return { ...state, row: Math.min(ROWS.length - 1, Math.max(0, state.row + by)), note: null };
}

function across(state: Setup, by: number): Setup {
    const parts = JOB_FIELDS[rowOf(state)]?.length ?? 0;
    return parts === 0 ? state : { ...state, part: Math.min(parts - 1, Math.max(0, state.part + by)), note: null };
}

const QUIT = new Set(['q', ESC, '\u0003']);

const stay = (state: Setup): Stepped => ({ state, effects: [] });

const COMMANDS: Readonly<Record<string, (state: Setup) => Stepped>> = {
    s: save,
    t: startTest,
    '\r': (state) => stay(enter(state)),
    ...Object.fromEntries([...UP].map((key) => [key, (state: Setup): Stepped => stay(move(state, -1))])),
    ...Object.fromEntries([...DOWN].map((key) => [key, (state: Setup): Stepped => stay(move(state, 1))])),
    ...Object.fromEntries([...LEFT].map((key) => [key, (state: Setup): Stepped => stay(across(state, -1))])),
    ...Object.fromEntries([...RIGHT].map((key) => [key, (state: Setup): Stepped => stay(across(state, 1))])),
};

export function step(state: Setup, key: string): Stepped {
    if (state.editing !== null) {
        return editKey({ ...state, asked: false }, state.editing, key);
    }
    if (QUIT.has(key)) {
        return leave(state);
    }
    return (COMMANDS[key] ?? stay)({ ...state, asked: false, note: state.asked ? null : state.note });
}

export const withAvailable = (state: Setup, available: readonly string[]): Setup => ({ ...state, available });

export const tested = (state: Setup, test: TestState): Setup => ({ ...state, test });

export function saved(state: Setup, failure: string | null, rewriting: boolean): Setup {
    return failure === null
        ? { ...state, stored: state.draft, note: rewriting ? 'rewriting' : 'saved', asked: false }
        : { ...state, note: { failed: failure } };
}
