import { hintFor, sizeOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/compaction.ts';
import { sectionOf } from '@stateforge-labs/session-ledger';
import type { SectionId } from '@stateforge-labs/session-ledger/unstable/i18n/sections.ts';
import { headlineOf, renderRecap } from '@stateforge-labs/session-ledger/unstable/recap/application/recap-shape.ts';
import type { ColumnTask, RecapColumn, Row, RowState, TextColumnView } from './model.ts';
import { assertAmount, assertCount, assertPercent } from './wording.ts';
import type { TextWording } from './wording.ts';
import { stageLine } from './compaction-stage.ts';
import { groupsOf } from './groups.ts';
import { linked } from './linked.ts';
import type { Group } from './groups.ts';
import { coloured, elapsed, plainMarkdown, visibleLength, wrap } from './wrap.ts';
import type { Style } from './wrap.ts';

export type Markdown = (markdown: string, width: number) => readonly string[] | null;

const PROMPT_LINES = 2;

const DEFAULT_MARK = '⚑';

const paint = (view: TextColumnView): Style => view.style ?? coloured;

const ago = (view: TextColumnView, ms: number): string => {
    const { amount, unit } = elapsed(ms);
    assertAmount(amount);
    return view.wording.ago(amount, unit);
};

export function badge(status: RowState, m: TextWording, style: Style = coloured): string {
    switch (status) {
        case 'working':
            return style.yellow(`● ${m.badge.working}`);
        case 'blocked':
            return style.red(`● ${m.badge.blocked}`);
        case 'idle':
            return style.green(`● ${m.badge.idle}`);
        case 'done':
            return style.green(`● ${m.badge.done}`);
        case 'unknown':
            return style.gray(`● ${m.badge.unknown}`);
        default: {
            const exhaustive: never = status;
            return String(exhaustive);
        }
    }
}

function noteLines(view: TextColumnView, pane: string, width: number): string[] {
    const style = paint(view);
    return (view.notes.get(pane) ?? []).flatMap((note) => {
        const when = note.at === null ? '' : ` ${ago(view, view.now - note.at)}`;
        const details = note.details.length > 0 ? ` · ${note.details.join(' · ')}` : '';
        return wrap(`${note.mark ?? DEFAULT_MARK} ${note.label}${when}${details}`, width, '  ').map(style.blue);
    });
}

function promptLines(lane: Row, width: number, style: Style): string[] {
    const prompt = lane.lastPrompt ?? null;
    return prompt === null ? [] : wrap(`› ${prompt.split('\n').join(' ')}`, width, '  ').slice(0, PROMPT_LINES).map(style.dim);
}

function contextHint(lane: Row, view: TextColumnView): string[] {
    const percent = hintFor(lane.context, view.compactHint ?? null);
    const window = lane.context === null || lane.context === undefined ? '' : sizeOf(lane.context.window);
    if (percent === null) {
        return [];
    }
    assertPercent(percent);
    return [view.wording.compaction.hint(percent, window)];
}

const stageShown = (lane: Row, view: TextColumnView): boolean => view.compactions?.some((each) => each.pane === lane.id) === true;

function stageLines(lane: Row, view: TextColumnView, width: number): string[] {
    const record = view.compactions?.find((each) => each.pane === lane.id);
    return record === undefined ? [] : wrap(stageLine(record, view.now, { wording: view.wording, style: paint(view) }), width, '  ');
}

function laneHeader(lane: Row, view: TextColumnView, width: number): string[] {
    const style = paint(view);
    const title = lane.title ?? lane.id;
    return [
        ...wrap(title, width).map((line) => style.bold(line)),
        ...wrap([badge(lane.state, view.wording, style), style.gray(`${lane.agent} ${lane.id}${lane.fromScreen ? ` ${view.wording.fromScreen}` : ''}`), ...(stageShown(lane, view) ? [] : contextHint(lane, view).map(style.yellow))].join(style.gray(' · ')), width, '  '),
        ...stageLines(lane, view, width),
        ...noteLines(view, lane.id, width),
        ...promptLines(lane, width, style),
    ];
}

function staleLines(view: TextColumnView, width: number): string[] {
    const style = paint(view);
    const code = view.version ?? null;
    const daemon = view.daemonVersion;
    return code === null || daemon === code ? [] : wrap(view.wording.daemonStale(daemon), width).map(style.yellow);
}

function recapMeta(view: TextColumnView, width: number): string[] {
    const style = paint(view);
    const { recap, wording: m } = view;
    const at = recap?.at ?? null;
    const parts = [
        style.bold(style.cyan(m.recapTitle)),
        at === null ? null : style.gray(ago(view, view.now - at)),
        recap?.backend ?? null,
        recap?.running === true ? style.magenta(m.updating) : null,
        view.version === undefined || view.version === null ? null : style.dim(`v${view.version}`),
    ].filter((part) => part !== null);
    return [...wrap(parts.join(style.gray(' · ')), width, '  '), ...staleLines(view, width)];
}

function markdownOf(task: ColumnTask | null, m: TextWording): string {
    if (task === null) {
        return '';
    }
    return task.sections === null ? task.markdown : renderRecap(task.sections, m.locale);
}

function body(task: ColumnTask | null, lanes: readonly Row[], width: number, markdown: Markdown, view: TextColumnView): string[] {
    const { wording: m } = view;
    const style = paint(view);
    const drawn = markdownOf(task, m);
    const links = (text: string): string => linked(text, lanes.map((lane) => lane.web));
    if (task !== null && task.sections !== null) {
        return plainMarkdown(drawn, width, style, links);
    }
    if (drawn !== '') {
        return [...(markdown(drawn, width) ?? plainMarkdown(drawn, width, style, links))];
    }
    const theirs = (view.rows ?? []).flatMap((c) => (c.harnessRecap === null ? [] : [c.harnessRecap]));
    if (theirs.length > 0) {
        return [style.gray(m.claudeOwn), ...theirs.flatMap((text) => wrap(text, width).map(style.italic))];
    }
    return wrap(m.noRecapYet, width).map(style.gray);
}

function errorLines(recap: RecapColumn | null, width: number, view: TextColumnView): string[] {
    const error = recap?.error ?? null;
    return error === null ? [] : ['', ...wrap(view.wording.recapError(error), width).map(paint(view).red)];
}

function warningLines(view: TextColumnView, width: number): string[] {
    const { warnings } = view;
    return warnings.length === 0 ? [] : [...warnings.flatMap((warning) => wrap(warning, width).map(paint(view).red)), ''];
}

const headersOf = (lanes: readonly Row[], view: TextColumnView, width: number): string[] =>
    lanes.flatMap((lane, index) => [...(index > 0 ? [''] : []), ...laneHeader(lane, view, width)]);

function taskBlock(group: Group, at: number, view: TextColumnView, width: number, markdown: Markdown): string[] {
    const style = paint(view);
    const number = at + 1;
    assertCount(number);
    const heading = group.task === null ? [] : [style.bold(style.cyan(`▌ ${group.task.name === '' ? view.wording.taskNumber(number) : group.task.name}`))];
    const recap = group.task === null ? [] : ['', ...body(group.task, group.lanes, width, markdown, view)];
    return [...heading, ...headersOf(group.lanes, view, width), ...recap];
}

export function present(view: TextColumnView, width: number, markdown: Markdown): string[] {
    const style = paint(view);
    if (view.rows === null || view.rows.length === 0) {
        return wrap(view.wording.waitingForAgent, width).map(style.gray);
    }
    const groups = groupsOf(view.rows, view.recap?.tasks ?? []);
    const rule = style.gray('─'.repeat(width));
    const end = errorLines(view.recap, width, view);
    if (groups.length > 1) {
        const blocks = groups.map((group, at) => taskBlock(group, at, view, width, markdown));
        return [...warningLines(view, width), ...recapMeta(view, width), '', ...blocks.reduce<string[]>((lines, block, at) => lines.concat(at > 0 ? ['', rule] : [], block), []), ...end];
    }
    return [
        ...warningLines(view, width),
        ...headersOf(view.rows, view, width),
        '',
        rule,
        ...recapMeta(view, width),
        '',
        ...body(groups[0]?.task ?? null, view.rows, width, markdown, view),
        ...end,
    ];
}

export type Mode = 'column' | 'modal' | 'bar';

export function footer(width: number, mode: Mode, m: TextWording, style: Style = coloured): string {
    const hints = mode === 'bar' ? [] : m.hints[mode];
    return style.gray(hints.find((hint) => visibleLength(hint) <= width) ?? '');
}

const PLAIN_BULLET = /^\s*[-*+]\s+/;

export function firstItem(markdown: string, section: SectionId): string | null {
    let inside = false;
    for (const line of markdown.split('\n')) {
        if (line.startsWith('#')) {
            inside = sectionOf(line) === section;
            continue;
        }
        const text = line.replace(PLAIN_BULLET, '').replaceAll('**', '').replaceAll('`', '').trim();
        if (inside && text !== '') {
            return text;
        }
    }
    return null;
}

function leadOf(task: ColumnTask): { needs: string | null; now: string | null } {
    if (task.sections === null) {
        return { needs: firstItem(task.markdown, 'needs'), now: firstItem(task.markdown, 'now') };
    }
    const lead = headlineOf(task.sections);
    return { needs: lead?.kind === 'needs' ? lead.text : null, now: lead?.kind === 'now' ? lead.text : null };
}

function leads(recap: RecapColumn | null): { needs: string | null; now: string | null } {
    const found = (recap?.tasks ?? []).map(leadOf);
    return { needs: found.find((lead) => lead.needs !== null)?.needs ?? null, now: found.find((lead) => lead.now !== null)?.now ?? null };
}

function finishedTasks(recap: RecapColumn | null): readonly ColumnTask[] {
    const tasks = recap?.tasks ?? [];
    const open = tasks.some((task) => (task.sections === null ? firstItem(task.markdown, 'next') : (task.sections.next[0] ?? null)) !== null);
    return open ? [] : tasks.filter((task) => (task.sections === null ? firstItem(task.markdown, 'done') : (task.sections.done[0] ?? null)) !== null);
}

function headline(view: TextColumnView): string {
    const style = paint(view);
    const shown = (view.compactions ?? []).toSorted((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0) || b.stageAt - a.stageAt)[0];
    if (shown !== undefined) {
        return stageLine(shown, view.now, { wording: view.wording, style }, shown.agent ?? null);
    }
    const { needs, now } = leads(view.recap);
    if (needs !== null) {
        return style.red(view.wording.needsYou(needs));
    }
    const finished = finishedTasks(view.recap).length > 0;
    return now ?? view.rows?.find((c) => c.harnessRecap !== null)?.harnessRecap ?? (finished ? view.wording.allDoneShort : view.wording.noRecapShort);
}

const BAR_MIN_HEAD = 20;

const clipTo = (text: string, width: number): string => wrap(text, width)[0] ?? '';

function dot(status: RowState, m: TextWording, style: Style): string {
    return badge(status, m, style).split(' ').slice(0, 1).join('');
}

export function presentBar(view: TextColumnView, width: number): string[] {
    const style = paint(view);
    const dots = (view.rows ?? []).map((lane) => dot(lane.state, view.wording, style)).join('');
    const head = `${style.bold(style.cyan('📝'))}${dots} ${style.dim(headline(view).split('\n').join(' '))}`;
    const tag = view.version === undefined || view.version === null ? '' : ` · v${view.version}`;
    if (tag === '' || width - tag.length < BAR_MIN_HEAD) {
        return [clipTo(head, width)];
    }
    const clipped = clipTo(head, width - tag.length);
    return [`${clipped}${style.dim(tag)}`];
}
