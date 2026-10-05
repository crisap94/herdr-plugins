// The settings modal as lines of text. Pure; every word comes from Messages.
import type { Messages } from '#src/i18n/messages.ts';
import { HARNESS_CHOICES, LOCALE_CHOICES, modelTarget, ROWS, rowOf } from '#src/recap/application/setup-keys.ts';
import type { RowId, Setup } from '#src/recap/application/setup-keys.ts';
import { AUTO_ORDER, MODEL_DEFAULTS } from '#src/recap/domain/backend.ts';
import type { BackendChoice, BackendId } from '#src/recap/domain/backend.ts';
import { style, wrap } from './wrap.ts';

const LABEL_WIDTH = 18;

/** `text` wrapped after `prefix`; continuation lines are indented under the text. wrap() trims spaces, so the indent is added here. */
function hanging(prefix: string, text: string, width: number, extra = ''): string[] {
    const room = Math.max(4, width - prefix.length - extra.length);
    return wrap(text, room).map((line, at) => `${at === 0 ? prefix : ' '.repeat(prefix.length)}${extra}${line}`);
}
const costOf = (usd: number): string => (usd > 0 ? `$${usd.toFixed(4)}` : '');

function labelOf(row: RowId, state: Setup, m: Messages): string {
    const target = row === 'model' ? modelTarget(state.draft, state.available) : null;
    return target === null ? m.setup.rows[row] : `${m.setup.rows[row]} (${target})`;
}

function modelText(model: string, id: BackendId, m: Messages): string {
    return model === '' ? m.setup.modelDefault(MODEL_DEFAULTS[id]) : model;
}

/** The stored setting in words: `ui` is the interface's language, `en`/`es` are named, free text as typed. */
function recapText(setting: string, m: Messages): string {
    const names: Readonly<Record<string, string>> = m.setup.languageNames;
    if (setting === 'ui') {
        return m.setup.sameAsInterface(names[m.locale] ?? m.locale);
    }
    return names[setting] ?? setting;
}

function valueOf(row: RowId, state: Setup, m: Messages): string {
    const { draft } = state;
    const target = modelTarget(draft, state.available);
    switch (row) {
        case 'harness':
            return draft.backend;
        case 'model':
            return target === null ? m.setup.modelNoAgent : modelText(draft.models[target], target, m);
        case 'locale':
            return m.setup.uiChoices[draft.locale];
        case 'recapLanguage':
            return recapText(draft.recapLanguage, m);
        default: {
            const exhaustive: never = row;
            return String(exhaustive);
        }
    }
}

function markOf(choice: BackendChoice, state: Setup): string {
    if (state.draft.backend === choice) {
        return '✓';
    }
    if (choice === 'auto' || choice === 'custom' || state.available === null) {
        return ' ';
    }
    return state.available.includes(choice) ? '●' : '○';
}

function harnessChoices(state: Setup, m: Messages, width: number): string[] {
    const editing = state.editing?.kind === 'choice' && rowOf(state) === 'harness' ? state.editing.at : -1;
    const notes: Readonly<Partial<Record<BackendChoice, string>>> = { auto: m.setup.auto(AUTO_ORDER.join(' → ')), custom: m.setup.custom };
    const lines = HARNESS_CHOICES.flatMap((choice, at) => {
        const note = notes[choice];
        const text = `${choice}${note === undefined ? '' : ` — ${note}`}`;
        return hanging(`    ${at === editing ? '▸' : ' '} ${markOf(choice, state)} `, text, width).map((line) => (at === editing ? style.bold(line) : line));
    });
    const legend = `${m.setup.legend.current} ✓ · ${m.setup.legend.available} ● · ${m.setup.legend.missing} ○`;
    return [...lines, ...hanging('    ', legend, width).map(style.dim)];
}

function localeChoices(state: Setup, m: Messages, width: number): string[] {
    const editing = state.editing?.kind === 'choice' && rowOf(state) === 'locale' ? state.editing.at : -1;
    return LOCALE_CHOICES.flatMap((choice, at) => hanging(`    ${at === editing ? '▸' : ' '} `, m.setup.uiChoices[choice], width).map((line) => (at === editing ? style.bold(line) : line)));
}

function hintOf(row: RowId, m: Messages): string | null {
    const hints: Readonly<Partial<Record<RowId, string>>> = { recapLanguage: m.setup.recapLanguageHint };
    return hints[row] ?? null;
}

/** What hangs under a row: its lock, its hint while focused, its choices. */
function under(row: RowId, state: Setup, m: Messages, width: number): string[] {
    const focused = rowOf(state) === row;
    const lock = state.locks[row];
    const hint = focused ? hintOf(row, m) : null;
    const choosing = focused && state.editing?.kind === 'choice';
    return [
        ...(lock === undefined ? [] : hanging('    ', m.setup.locked(lock), width).map(style.yellow)),
        ...(hint === null ? [] : hanging('    ', hint, width).map(style.dim)),
        ...(row === 'harness' ? harnessChoices(state, m, width) : []),
        ...(row === 'locale' && choosing ? localeChoices(state, m, width) : []),
    ];
}

function rowLines(row: RowId, state: Setup, m: Messages, width: number): string[] {
    const focused = rowOf(state) === row;
    const editing = focused && state.editing?.kind === 'text' ? state.editing.buffer : null;
    const value = editing === null ? valueOf(row, state, m) : `${editing}█`;
    const lines = hanging(`${focused ? '▸' : ' '} ${labelOf(row, state, m).padEnd(LABEL_WIDTH)} `, value, width);
    return [...(focused ? lines.map(style.bold) : lines), ...under(row, state, m, width)];
}

function noteLine(state: Setup, m: Messages): string | null {
    const { note } = state;
    const lock = state.locks[rowOf(state)] ?? '';
    const texts: Readonly<Record<string, string>> = {
        locked: m.setup.locked(lock), unsaved: m.setup.unsaved, saved: m.setup.saved, rewriting: m.setup.rewriting,
        nothing: m.setup.nothingToSave, 'no-agent': m.setup.modelNoAgent,
    };
    if (note === null) {
        return null;
    }
    if (typeof note !== 'string') {
        return m.setup.saveFailed(note.failed);
    }
    return texts[note] ?? null;
}

function testLine(state: Setup, m: Messages): string | null {
    const { test } = state;
    switch (test.kind) {
        case 'idle':
            return null;
        case 'running':
            return style.yellow(m.setup.test.running);
        case 'ok':
            return style.green(m.setup.test.ok(test.seconds.toFixed(1), costOf(test.costUsd)));
        case 'failed':
            return style.red(m.setup.test.failed(test.why));
        default: {
            const exhaustive: never = test;
            return String(exhaustive);
        }
    }
}

/** The whole modal, as lines no wider than `width`. */
export function setupView(state: Setup, m: Messages, width: number): string[] {
    const note = noteLine(state, m);
    const status = [
        ...(state.available === null ? [style.gray(m.setup.loading)] : []),
        ...(note === null ? [] : wrap(note, width).map(style.cyan)),
        ...wrap(testLine(state, m) ?? '', width).filter((line) => line !== ''),
    ];
    return [
        style.bold(style.cyan(m.setup.title)),
        '',
        ...ROWS.flatMap((row) => rowLines(row, state, m, width).concat([''])),
        ...status,
    ];
}

/** The longest hint that fits: a cut-off hint reads as a bug. */
export function setupFooter(state: Setup, m: Messages, width: number): string {
    const hints = state.editing === null ? m.setup.keys : m.setup.editKeys;
    return style.gray(hints.find((hint) => hint.length <= width) ?? '');
}
