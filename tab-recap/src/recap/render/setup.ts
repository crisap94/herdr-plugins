import { must } from '#src/protocol/result.ts';
import type { Catalog } from '#src/i18n/messages.ts';
import { DECIDER_BY_OPTIONS, EFFORT_CHOICES, fieldOf, FIELDS, HARNESS_CHOICES, JOB_BY_OPTIONS, JOB_FIELDS, LOCALE_CHOICES, MODE_CHOICES, modelTarget, ROWS, rowOf, STYLE_CHOICES, SWITCH_CHOICES, MISSED_CHOICES } from '#src/recap/application/setup-keys.ts';
import type { FieldId, RowId, Setup } from '#src/recap/application/setup-keys.ts';
import type { DeciderSetting } from '#src/recap/domain/job.ts';
import { COMPACT_NOTE_CHOICES } from '#src/recap/domain/compact-note.ts';
import { AUTO_ORDER, hasAvailabilityMark, JOB_HARNESSES, MODEL_DEFAULTS } from '#src/recap/domain/backend.ts';
import type { BackendChoice, BackendId } from '#src/recap/domain/backend.ts';
import type { Count } from '#src/recap/domain/count.ts';
import { uncheckedAgentKind } from '#src/recap/domain/ids.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { parseUsd, type Usd } from '#src/recap/domain/usd.ts';
import { coloured, visibleLength, wrap } from '@stateforge-labs/recap-view/unstable/wrap.ts';
import type { Style } from '@stateforge-labs/recap-view/unstable/wrap.ts';

type SetupCatalog = Pick<Catalog, 'locale' | 'setup'>;

const LABEL_WIDTH = 18;
const EMPTY = must(parseText(''));
const BLANK = EMPTY;
const INDENT = must(parseText('    '));
const SPACE = must(parseText(' '));
const CHECK = must(parseText('✓'));

const paint = (apply: Style['bold'], text: Text): Text => must(parseText(apply(text)));
const wrapLines = (text: Text, width: Count): Text[] => wrap(text, width).map((line) => must(parseText(line)));

function hanging(prefix: Text, text: Text, width: Count, extra: Text = EMPTY): Text[] {
    const room = Math.max(4, width - prefix.length - extra.length);
    return wrap(text, room).map((line, at) => must(parseText(`${at === 0 ? prefix : ' '.repeat(prefix.length)}${extra}${line}`)));
}
const costOf = (usd: Usd): Text => must(parseText(usd > 0 ? `$${usd.toFixed(4)}` : ''));

const labelOf = (row: RowId, catalog: SetupCatalog): Text => catalog.setup.rows[row];

function modelText(model: Text, id: BackendId, catalog: SetupCatalog): Text {
    return model === '' ? catalog.setup.modelDefault(must(parseText(MODEL_DEFAULTS[id]))) : model;
}

function recapText(setting: Text, catalog: SetupCatalog): Text {
    const { languageNames: names } = catalog.setup;
    if (setting === 'ui') {
        return catalog.setup.sameAsInterface(names[catalog.locale]);
    }
    if (setting === 'en') {
        return names.en;
    }
    if (setting === 'es') {
        return names.es;
    }
    return setting;
}

function screenText(setting: Text, catalog: SetupCatalog): Text {
    const words: Readonly<Record<string, Text>> = { '': catalog.setup.screenNone, all: catalog.setup.screenAll };
    return words[setting] ?? setting;
}

const hintText = (hint: Text, catalog: SetupCatalog): Text => (hint === 'off' ? catalog.setup.compactHintOff : must(parseText(`${hint}%`)));

function jobText(row: RowId, state: Setup, catalog: SetupCatalog): Text {
    const focused = rowOf(state) === row ? state.part : -1;
    const typing = focused === 1 && state.editing?.kind === 'text' ? state.editing.buffer : null;
    const { draft } = state;
    const target = modelTarget(draft, state.available);
    const others: Readonly<Partial<Record<RowId, DeciderSetting>>> = { judgeJob: draft.judge, curatorJob: draft.curate, autocompactJob: draft.decide };
    const other = others[row] ?? draft.compact;
    const parts: readonly Text[] = row === 'recapJob'
        ? [must(parseText(draft.backend)), target === null ? catalog.setup.modelNoAgent : modelText(must(parseText(draft.models[target])), target, catalog), must(parseText(draft.effort))]
        : [catalog.setup.jobBy[other.by], other.model === '' ? catalog.setup.compactModelSame : must(parseText(other.model)), must(parseText(other.effort))];
    return must(parseText(parts.map((part, at) => {
        if (at === 1 && typing !== null) {
            return `[${typing}█]`;
        }
        return at === focused && state.editing === null ? `[${part}]` : part;
    }).join(' · ')));
}

type ValueOf = (state: Setup, catalog: SetupCatalog) => Text;

const VALUES: Readonly<Record<RowId, ValueOf>> = {
    recapJob: (state, catalog) => jobText('recapJob', state, catalog),
    compactJob: (state, catalog) => jobText('compactJob', state, catalog),
    judgeJob: (state, catalog) => jobText('judgeJob', state, catalog),
    curatorJob: (state, catalog) => jobText('curatorJob', state, catalog),
    autocompactJob: (state, catalog) => jobText('autocompactJob', state, catalog),
    autocompact: (state, catalog) => catalog.setup.autocompactChoices[state.draft.autocompact],
    autocompactAt: (state) => must(parseText(`${state.draft.autocompactAt}%`)),
    autocompactStyle: (state, catalog) => catalog.setup.autocompactStyleChoices[state.draft.autocompactStyle],
    autocompactMissed: (state, catalog) => catalog.setup.autocompactMissedChoices[state.draft.autocompactMissed],
    locale: (state, catalog) => catalog.setup.uiChoices[state.draft.locale],
    recapLanguage: (state, catalog) => recapText(must(parseText(state.draft.recapLanguage)), catalog),
    screenAgents: (state, catalog) => screenText(must(parseText(state.draft.screenAgents)), catalog),
    gitNote: (state, catalog) => catalog.setup.gitNoteChoices[state.draft.gitNote],
    telemetryTags: (state, catalog) => catalog.setup.telemetryTagsChoices[state.draft.telemetryTags],
    herdrEvents: (state, catalog) => catalog.setup.herdrEventsChoices[state.draft.herdrEvents],
    compactTarget: (state) => must(parseText(state.draft.compactTarget)),
    compactNote: (state, catalog) => catalog.setup.compactNoteChoices[state.draft.compactNote],
    compactHint: (state, catalog) => hintText(must(parseText(state.draft.compactHint)), catalog),
    contextWindow: (state, catalog) => (state.draft.contextWindow === '' ? catalog.setup.contextWindowDetected : must(parseText(state.draft.contextWindow))),
};

const valueOf = (row: RowId, state: Setup, catalog: SetupCatalog): Text => VALUES[row](state, catalog);

function markOf(choice: BackendChoice, state: Setup): Text {
    if (state.draft.backend === choice) {
        return CHECK;
    }
    if (choice === 'auto' || !hasAvailabilityMark(choice) || state.available === null) {
        return SPACE;
    }
    return must(parseText(state.available.includes(uncheckedAgentKind(choice)) ? '●' : '○'));
}

function harnessChoices(state: Setup, catalog: SetupCatalog, width: Count, style: Style): Text[] {
    const editing = state.editing?.kind === 'choice' && fieldOf(state) === 'harness' ? state.editing.at : -1;
    const notes: Readonly<Partial<Record<BackendChoice, Text>>> = {
        auto: catalog.setup.auto(must(parseText(AUTO_ORDER.join(' → ')))),
        ...Object.fromEntries(JOB_HARNESSES.filter(({ customCommand }) => customCommand).map(({ id }) => [id, catalog.setup.custom])),
    };
    const lines = HARNESS_CHOICES.flatMap((choice, at) => {
        const note = notes[choice];
        const text = must(parseText(`${choice}${note === undefined ? '' : ` — ${note}`}`));
        const prefix = must(parseText(`    ${at === editing ? '▸' : ' '} ${markOf(choice, state)} `));
        return hanging(prefix, text, width).map((line) => (at === editing ? paint(style.bold, line) : line));
    });
    const legend = must(parseText(`${catalog.setup.legend.current} ✓ · ${catalog.setup.legend.available} ● · ${catalog.setup.legend.missing} ○`));
    return [...lines, ...hanging(INDENT, legend, width).map((line) => paint(style.dim, line))];
}

function pickList(state: Setup, labels: readonly Text[], width: Count, style: Style): Text[] {
    const editing = state.editing?.kind === 'choice' ? state.editing.at : -1;
    return labels.flatMap((label, at) => hanging(must(parseText(`    ${at === editing ? '▸' : ' '} `)), label, width).map((line) => (at === editing ? paint(style.bold, line) : line)));
}

function hintOf(row: RowId, catalog: SetupCatalog): Text | null {
    const hints: Readonly<Partial<Record<RowId, Text>>> = { herdrEvents: catalog.setup.herdrEventsHint, compactJob: catalog.setup.compactJobHint, judgeJob: catalog.setup.judgeJobHint, curatorJob: catalog.setup.curateJobHint, autocompact: catalog.setup.autocompactHint, autocompactAt: catalog.setup.autocompactAtHint, autocompactStyle: catalog.setup.autocompactStyleHint, autocompactMissed: catalog.setup.autocompactMissedHint, autocompactJob: catalog.setup.autocompactJobHint, recapLanguage: catalog.setup.recapLanguageHint, screenAgents: catalog.setup.screenAgentsHint, compactTarget: catalog.setup.compactTargetHint, compactNote: catalog.setup.compactNoteHint, compactHint: catalog.setup.compactHintHint, contextWindow: catalog.setup.contextWindowHint };
    return hints[row] ?? null;
}

function under(row: RowId, state: Setup, catalog: SetupCatalog, width: Count, style: Style): Text[] {
    const focused = rowOf(state) === row;
    const locks = [...new Set((JOB_FIELDS[row] ?? FIELDS.filter((field) => field === row)).flatMap((field) => state.locks[field] ?? []))];
    const hint = focused ? hintOf(row, catalog) : null;
    return [
        ...locks.flatMap((lock) => hanging(INDENT, catalog.setup.locked(must(parseText(lock))), width).map((line) => paint(style.yellow, line))),
        ...(hint === null ? [] : hanging(INDENT, hint, width).map((line) => paint(style.dim, line))),
        ...(focused || row === 'recapJob' ? choicesUnder(row, state, catalog, width, style) : []),
    ];
}

function choicesUnder(row: RowId, state: Setup, catalog: SetupCatalog, width: Count, style: Style): Text[] {
    const choosing = state.editing?.kind === 'choice';
    const lists: Readonly<Partial<Record<FieldId, () => Text[]>>> = {
        locale: () => pickList(state, LOCALE_CHOICES.map((choice) => catalog.setup.uiChoices[choice]), width, style),
        gitNote: () => pickList(state, SWITCH_CHOICES.map((choice) => catalog.setup.gitNoteChoices[choice]), width, style),
        telemetryTags: () => pickList(state, SWITCH_CHOICES.map((choice) => catalog.setup.telemetryTagsChoices[choice]), width, style),
        herdrEvents: () => pickList(state, SWITCH_CHOICES.map((choice) => catalog.setup.herdrEventsChoices[choice]), width, style),
        compactNote: () => pickList(state, COMPACT_NOTE_CHOICES.map((choice) => catalog.setup.compactNoteChoices[choice]), width, style),
        effort: () => pickList(state, EFFORT_CHOICES.map((choice) => catalog.setup.effortChoices[choice]), width, style),
        compactBy: () => pickList(state, JOB_BY_OPTIONS.map((choice) => catalog.setup.jobByChoices[choice]), width, style),
        compactEffort: () => pickList(state, EFFORT_CHOICES.map((choice) => catalog.setup.effortChoices[choice]), width, style),
        judgeBy: () => pickList(state, JOB_BY_OPTIONS.map((choice) => (choice === 'off' ? catalog.setup.judgeOffChoice : catalog.setup.jobByChoices[choice])), width, style),
        judgeEffort: () => pickList(state, EFFORT_CHOICES.map((choice) => catalog.setup.effortChoices[choice]), width, style),
        curateBy: () => pickList(state, JOB_BY_OPTIONS.map((choice) => (choice === 'off' ? catalog.setup.curateOff : catalog.setup.jobByChoices[choice])), width, style),
        autocompact: () => pickList(state, MODE_CHOICES.map((choice) => catalog.setup.autocompactChoices[choice]), width, style),
        autocompactStyle: () => pickList(state, STYLE_CHOICES.map((choice) => catalog.setup.autocompactStyleChoices[choice]), width, style),
        autocompactMissed: () => pickList(state, MISSED_CHOICES.map((choice) => catalog.setup.autocompactMissedChoices[choice]), width, style),
        decideBy: () => pickList(state, DECIDER_BY_OPTIONS.map((choice) => (choice === 'off' ? catalog.setup.deciderOff : catalog.setup.jobByChoices[choice])), width, style),
        decideEffort: () => pickList(state, EFFORT_CHOICES.map((choice) => catalog.setup.effortChoices[choice]), width, style),
        curateEffort: () => pickList(state, EFFORT_CHOICES.map((choice) => catalog.setup.effortChoices[choice]), width, style),
    };
    const field = fieldOf(state);
    const drawn = row === 'recapJob' && (field === 'harness' || !choosing) ? harnessChoices(state, catalog, width, style) : [];
    return [...drawn, ...(choosing ? (lists[field]?.() ?? []) : [])];
}

function rowLines(row: RowId, state: Setup, catalog: SetupCatalog, width: Count, style: Style): Text[] {
    const focused = rowOf(state) === row;
    const jobRow = JOB_FIELDS[row] !== undefined;
    const editing = focused && !jobRow && state.editing?.kind === 'text' ? state.editing.buffer : null;
    const value = editing === null ? valueOf(row, state, catalog) : must(parseText(`${editing}█`));
    const lines = hanging(must(parseText(`${focused ? '▸' : ' '} ${labelOf(row, catalog).padEnd(LABEL_WIDTH)} `)), value, width);
    return [...(focused ? lines.map((line) => paint(style.bold, line)) : lines), ...under(row, state, catalog, width, style)];
}

function noteLine(state: Setup, catalog: SetupCatalog): Text | null {
    const { note } = state;
    const lock = state.locks[fieldOf(state)] ?? '';
    const texts: Readonly<Record<string, Text>> = {
        locked: catalog.setup.locked(must(parseText(lock))), unsaved: catalog.setup.unsaved, saved: catalog.setup.saved, rewriting: catalog.setup.rewriting,
        nothing: catalog.setup.nothingToSave, 'no-agent': catalog.setup.modelNoAgent,
    };
    if (note === null) {
        return null;
    }
    if (typeof note !== 'string') {
        return catalog.setup.saveFailed(must(parseText(note.failed)));
    }
    return texts[note] ?? null;
}

function testLine(state: Setup, catalog: SetupCatalog, style: Style): Text | null {
    const { test } = state;
    switch (test.kind) {
        case 'idle':
            return null;
        case 'running':
            return paint(style.yellow, catalog.setup.test.running);
        case 'ok':
            return paint(style.green, catalog.setup.test.ok(must(parseText(test.seconds.toFixed(1))), costOf(must(parseUsd(test.costUsd)))));
        case 'failed':
            return paint(style.red, catalog.setup.test.failed(must(parseText(test.why))));
        default: {
            const exhaustive: never = test;
            return must(parseText(String(exhaustive)));
        }
    }
}

export function setupLines(state: Setup, catalog: SetupCatalog, width: Count, style: Style = coloured): Text[] {
    const note = noteLine(state, catalog);
    const test = testLine(state, catalog, style);
    const heading = wrapLines(catalog.setup.modelsHeading, width).flatMap((line) => paint(style.dim, line));
    const noteRows = note === null ? [] : wrapLines(note, width).map((line) => paint(style.cyan, line));
    const status = [
        ...(state.available === null ? [paint(style.gray, catalog.setup.loading)] : []),
        ...noteRows,
        ...wrapLines(test ?? BLANK, width).filter((line) => line !== ''),
    ];
    const body = ROWS.flatMap((row) => (row === 'recapJob' ? heading : []).concat(rowLines(row, state, catalog, width, style), [BLANK]));
    return [
        paint(style.bold, paint(style.cyan, catalog.setup.title)),
        BLANK,
        ...body,
        ...status,
    ];
}

export function setupFooterLine(state: Setup, catalog: SetupCatalog, width: Count, style: Style = coloured): Text {
    const hints = state.editing === null ? catalog.setup.keys : catalog.setup.editKeys;
    return paint(style.gray, hints.find((hint) => visibleLength(hint) <= width) ?? EMPTY);
}
