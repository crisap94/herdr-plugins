// The settings modal as lines of text. Pure; every word comes from Messages.
import type { Messages } from '#src/i18n/messages.ts';
import { EFFORT_CHOICES, fieldOf, HARNESS_CHOICES, JOB_BY_OPTIONS, JOB_FIELDS, LOCALE_CHOICES, modelTarget, ROWS, rowOf, SWITCH_CHOICES } from '#src/recap/application/setup-keys.ts';
import type { FieldId, RowId, Setup } from '#src/recap/application/setup-keys.ts';
import { AUTO_ORDER, MODEL_DEFAULTS } from '#src/recap/domain/backend.ts';
import type { BackendChoice, BackendId } from '#src/recap/domain/backend.ts';
import { coloured, visibleLength, wrap } from './wrap.ts';
import type { Style } from './wrap.ts';

const LABEL_WIDTH = 18;

/** `text` wrapped after `prefix`; continuation lines are indented under the text. wrap() trims spaces, so the indent is added here. */
function hanging(prefix: string, text: string, width: number, extra = ''): string[] {
    const room = Math.max(4, width - prefix.length - extra.length);
    return wrap(text, room).map((line, at) => `${at === 0 ? prefix : ' '.repeat(prefix.length)}${extra}${line}`);
}
const costOf = (usd: number): string => (usd > 0 ? `$${usd.toFixed(4)}` : '');

const labelOf = (row: RowId, m: Messages): string => m.setup.rows[row];

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

/** The stored setting in words: empty is none, `all` is every agent, otherwise the list as typed. */
function screenText(setting: string, m: Messages): string {
    const words: Readonly<Record<string, string>> = { '': m.setup.screenNone, all: m.setup.screenAll };
    return words[setting] ?? setting;
}

/** The compaction rows in words: the hint as a percentage (or off), an empty window as «found at runtime». */
const hintText = (hint: string, m: Messages): string => (hint === 'off' ? m.setup.compactHintOff : `${hint}%`);

/** A job's three parts in words, `harness · model · effort`; the focused one is bracketed (the model's text is the buffer while it is typed). */
function jobText(row: RowId, state: Setup, m: Messages): string {
    const focused = rowOf(state) === row ? state.part : -1;
    const typing = focused === 1 && state.editing?.kind === 'text' ? state.editing.buffer : null;
    const { draft } = state;
    const target = modelTarget(draft, state.available);
    const parts = row === 'recapJob'
        ? [draft.backend, target === null ? m.setup.modelNoAgent : modelText(draft.models[target], target, m), draft.effort]
        : [m.setup.jobBy[draft.compact.by], draft.compact.model === '' ? m.setup.compactModelSame : draft.compact.model, draft.compact.effort];
    const shown = (part: string, at: number): string => {
        if (at === 1 && typing !== null) {
            return `[${typing}█]`;
        }
        return at === focused && state.editing === null ? `[${part}]` : part;
    };
    return parts.map(shown).join(' · ');
}

/** What each row shows as its value; a row added to `RowId` cannot compile without one. */
const VALUES: Readonly<Record<RowId, (state: Setup, m: Messages) => string>> = {
    recapJob: (state, m) => jobText('recapJob', state, m),
    compactJob: (state, m) => jobText('compactJob', state, m),
    locale: (state, m) => m.setup.uiChoices[state.draft.locale],
    recapLanguage: (state, m) => recapText(state.draft.recapLanguage, m),
    screenAgents: (state, m) => screenText(state.draft.screenAgents, m),
    gitNote: (state, m) => m.setup.gitNoteChoices[state.draft.gitNote],
    compactTarget: (state) => state.draft.compactTarget,
    compactHint: (state, m) => hintText(state.draft.compactHint, m),
    contextWindow: (state, m) => (state.draft.contextWindow === '' ? m.setup.contextWindowDetected : state.draft.contextWindow),
};

const valueOf = (row: RowId, state: Setup, m: Messages): string => VALUES[row](state, m);

function markOf(choice: BackendChoice, state: Setup): string {
    if (state.draft.backend === choice) {
        return '✓';
    }
    if (choice === 'auto' || choice === 'custom' || state.available === null) {
        return ' ';
    }
    return state.available.includes(choice) ? '●' : '○';
}

function harnessChoices(state: Setup, m: Messages, width: number, style: Style): string[] {
    const editing = state.editing?.kind === 'choice' && fieldOf(state) === 'harness' ? state.editing.at : -1;
    const notes: Readonly<Partial<Record<BackendChoice, string>>> = { auto: m.setup.auto(AUTO_ORDER.join(' → ')), custom: m.setup.custom };
    const lines = HARNESS_CHOICES.flatMap((choice, at) => {
        const note = notes[choice];
        const text = `${choice}${note === undefined ? '' : ` — ${note}`}`;
        return hanging(`    ${at === editing ? '▸' : ' '} ${markOf(choice, state)} `, text, width).map((line) => (at === editing ? style.bold(line) : line));
    });
    const legend = `${m.setup.legend.current} ✓ · ${m.setup.legend.available} ● · ${m.setup.legend.missing} ○`;
    return [...lines, ...hanging('    ', legend, width).map(style.dim)];
}

/** The choices of the field being edited, one per line, the highlighted one marked. */
function pickList(state: Setup, labels: readonly string[], width: number, style: Style): string[] {
    const editing = state.editing?.kind === 'choice' ? state.editing.at : -1;
    return labels.flatMap((label, at) => hanging(`    ${at === editing ? '▸' : ' '} `, label, width).map((line) => (at === editing ? style.bold(line) : line)));
}

function hintOf(row: RowId, m: Messages): string | null {
    const hints: Readonly<Partial<Record<RowId, string>>> = { compactJob: m.setup.compactJobHint, recapLanguage: m.setup.recapLanguageHint, screenAgents: m.setup.screenAgentsHint, compactTarget: m.setup.compactTargetHint, compactHint: m.setup.compactHintHint, contextWindow: m.setup.contextWindowHint };
    return hints[row] ?? null;
}

/** What hangs under a row: the locks, its hint while focused, its choices. */
function under(row: RowId, state: Setup, m: Messages, width: number, style: Style): string[] {
    const focused = rowOf(state) === row;
    const locks = [...new Set((JOB_FIELDS[row] ?? [row as FieldId]).flatMap((field) => state.locks[field] ?? []))];
    const hint = focused ? hintOf(row, m) : null;
    return [
        ...locks.flatMap((lock) => hanging('    ', m.setup.locked(lock), width).map(style.yellow)),
        ...(hint === null ? [] : hanging('    ', hint, width).map(style.dim)),
        ...(focused || row === 'recapJob' ? choicesUnder(row, state, m, width, style) : []),
    ];
}

/** The harness's choices always hang under the recap writer; the others open while their field is being edited. */
function choicesUnder(row: RowId, state: Setup, m: Messages, width: number, style: Style): string[] {
    const choosing = state.editing?.kind === 'choice';
    const lists: Readonly<Partial<Record<FieldId, () => string[]>>> = {
        locale: () => pickList(state, LOCALE_CHOICES.map((choice) => m.setup.uiChoices[choice]), width, style),
        gitNote: () => pickList(state, SWITCH_CHOICES.map((choice) => m.setup.gitNoteChoices[choice]), width, style),
        effort: () => pickList(state, EFFORT_CHOICES.map((choice) => m.setup.effortChoices[choice]), width, style),
        compactBy: () => pickList(state, JOB_BY_OPTIONS.map((choice) => m.setup.jobByChoices[choice]), width, style),
        compactEffort: () => pickList(state, EFFORT_CHOICES.map((choice) => m.setup.effortChoices[choice]), width, style),
    };
    const field = fieldOf(state);
    const drawn = row === 'recapJob' && (field === 'harness' || !choosing) ? harnessChoices(state, m, width, style) : [];
    return [...drawn, ...(choosing ? (lists[field]?.() ?? []) : [])];
}

function rowLines(row: RowId, state: Setup, m: Messages, width: number, style: Style): string[] {
    const focused = rowOf(state) === row;
    const jobRow = JOB_FIELDS[row] !== undefined;
    const editing = focused && !jobRow && state.editing?.kind === 'text' ? state.editing.buffer : null;
    const value = editing === null ? valueOf(row, state, m) : `${editing}█`;
    const lines = hanging(`${focused ? '▸' : ' '} ${labelOf(row, m).padEnd(LABEL_WIDTH)} `, value, width);
    return [...(focused ? lines.map(style.bold) : lines), ...under(row, state, m, width, style)];
}

function noteLine(state: Setup, m: Messages): string | null {
    const { note } = state;
    const lock = state.locks[fieldOf(state)] ?? '';
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

function testLine(state: Setup, m: Messages, style: Style): string | null {
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
export function setupView(state: Setup, m: Messages, width: number, style: Style = coloured): string[] {
    const note = noteLine(state, m);
    const status = [
        ...(state.available === null ? [style.gray(m.setup.loading)] : []),
        ...(note === null ? [] : wrap(note, width).map(style.cyan)),
        ...wrap(testLine(state, m, style) ?? '', width).filter((line) => line !== ''),
    ];
    return [
        style.bold(style.cyan(m.setup.title)),
        '',
        ...ROWS.flatMap((row) => (row === 'recapJob' ? wrap(m.setup.modelsHeading, width).map(style.dim) : []).concat(rowLines(row, state, m, width, style), [''])),
        ...status,
    ];
}

/** The longest hint that fits: a cut-off hint reads as a bug. */
export function setupFooter(state: Setup, m: Messages, width: number, style: Style = coloured): string {
    const hints = state.editing === null ? m.setup.keys : m.setup.editKeys;
    return style.gray(hints.find((hint) => visibleLength(hint) <= width) ?? '');
}
