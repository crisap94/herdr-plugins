import { hintFor, sizeOf } from '#src/recap/domain/compaction.ts';
import type { Messages } from '#src/i18n/messages.ts';
import { sectionOf } from '#src/i18n/sections.ts';
import type { SectionId } from '#src/i18n/sections.ts';
import { laneStatus } from '#src/recap/domain/status.ts';
import type { LaneStatus } from '#src/recap/domain/status.ts';
import type { CompactionRecord } from '#src/ports/compaction-records.ts';
import { DEFAULT_MARK } from '#src/ports/extension.ts';
import { isScreenSource } from '#src/ports/screens.ts';
import type { Note } from '#src/ports/extension.ts';
import type { LaneCursor, TabRecap } from '#src/ports/recap-records.ts';
import type { TabLane, TabView } from '#src/ports/tab-views.ts';
import { headlineOf, renderRecap } from '#src/recap/application/recap-shape.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';
import { stageLine } from './compaction-stage.ts';
import { groupsOf } from './groups.ts';
import { linked } from './linked.ts';
import type { Group } from './groups.ts';
import { coloured, elapsed, plainMarkdown, visibleLength, wrap } from './wrap.ts';
import type { Style } from './wrap.ts';

export interface ColumnView {
    readonly tab: TabView | null;
    readonly recap: TabRecap | null;
    readonly notes: ReadonlyMap<string, readonly Note[]>;
    readonly warnings: readonly string[];
    readonly now: number;
    readonly messages: Messages;
    readonly version?: string | null;
    readonly compactHint?: number | null;
    readonly compactions?: readonly CompactionRecord[];
    readonly style?: Style;
}

export type Markdown = (markdown: string, width: number) => readonly string[] | null;

const PROMPT_LINES = 2;

const paint = (view: ColumnView): Style => view.style ?? coloured;

const ago = (view: ColumnView, ms: number): string => view.messages.ago(elapsed(ms).amount, elapsed(ms).unit);

export function badge(status: LaneStatus, m: Messages, style: Style = coloured): string {
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

function noteLines(view: ColumnView, pane: string, width: number): string[] {
    const style = paint(view);
    return (view.notes.get(pane) ?? []).flatMap((note) => {
        const when = note.at === null ? '' : ` ${ago(view, view.now - note.at)}`;
        const details = note.details.length > 0 ? ` · ${note.details.join(' · ')}` : '';
        return wrap(`${note.mark ?? DEFAULT_MARK} ${note.label}${when}${details}`, width, '  ').map(style.blue);
    });
}

function promptLines(lane: TabLane, cursor: LaneCursor | undefined, width: number, style: Style): string[] {
    const prompt = lane.lastPrompt ?? cursor?.lastPrompt ?? null;
    return prompt === null ? [] : wrap(`› ${prompt.split('\n').join(' ')}`, width, '  ').slice(0, PROMPT_LINES).map(style.dim);
}

function contextHint(lane: TabLane, view: ColumnView): string[] {
    const percent = hintFor(lane.context, view.compactHint ?? null);
    const window = lane.context === null || lane.context === undefined ? '' : sizeOf(lane.context.window);
    return percent === null ? [] : [view.messages.compaction.hint(percent, window)];
}

const stageShown = (lane: TabLane, view: ColumnView): boolean => view.compactions?.some((each) => each.pane === lane.pane) === true;

function stageLines(lane: TabLane, view: ColumnView, width: number): string[] {
    const record = view.compactions?.find((each) => each.pane === lane.pane);
    return record === undefined ? [] : wrap(stageLine(record, view.now, { messages: view.messages, style: paint(view) }), width, '  ');
}

function laneHeader(lane: TabLane, view: ColumnView, width: number): string[] {
    const style = paint(view);
    const cursor = view.recap?.lanes.find((c) => c.pane === lane.pane);
    const title = cursor?.title ?? lane.title ?? lane.pane;
    return [
        ...wrap(title, width).map((line) => style.bold(line)),
        ...wrap([badge(laneStatus(lane.status), view.messages, style), style.gray(`${lane.agent} ${lane.pane}${cursor !== undefined && isScreenSource(cursor.transcript) ? ` ${view.messages.fromScreen}` : ''}`), ...(stageShown(lane, view) ? [] : contextHint(lane, view).map(style.yellow))].join(style.gray(' · ')), width, '  '),
        ...stageLines(lane, view, width),
        ...noteLines(view, lane.pane, width),
        ...promptLines(lane, cursor, width, style),
    ];
}

function staleLines(view: ColumnView, width: number): string[] {
    const style = paint(view);
    const code = view.version ?? null;
    const daemon = view.tab?.daemonVersion ?? null;
    return code === null || daemon === code ? [] : wrap(view.messages.daemonStale(daemon), width).map(style.yellow);
}

function recapMeta(view: ColumnView, width: number): string[] {
    const style = paint(view);
    const { recap, messages: m } = view;
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

function markdownOf(task: RecapTask | null, m: Messages): string {
    if (task === null) {
        return '';
    }
    return task.sections === null ? task.markdown : renderRecap(task.sections, m.locale);
}

function body(task: RecapTask | null, lanes: readonly TabLane[], width: number, markdown: Markdown, view: ColumnView): string[] {
    const { messages: m, recap } = view;
    const style = paint(view);
    const drawn = markdownOf(task, m);
    const links = (text: string): string => linked(text, lanes.map((lane) => lane.web));
    if (task !== null && task.sections !== null) {
        return plainMarkdown(drawn, width, style, links);
    }
    if (drawn !== '') {
        return [...(markdown(drawn, width) ?? plainMarkdown(drawn, width, style, links))];
    }
    const theirs = (recap?.lanes ?? []).flatMap((c) => (c.claudeRecap === null ? [] : [c.claudeRecap]));
    if (theirs.length > 0) {
        return [style.gray(m.claudeOwn), ...theirs.flatMap((text) => wrap(text, width).map(style.italic))];
    }
    return wrap(m.noRecapYet, width).map(style.gray);
}

function errorLines(recap: TabRecap | null, width: number, view: ColumnView): string[] {
    const error = recap?.error ?? null;
    return error === null ? [] : ['', ...wrap(view.messages.recapError(error), width).map(paint(view).red)];
}

function warningLines(view: ColumnView, width: number): string[] {
    const { warnings } = view;
    return warnings.length === 0 ? [] : [...warnings.flatMap((warning) => wrap(warning, width).map(paint(view).red)), ''];
}

const headersOf = (lanes: readonly TabLane[], view: ColumnView, width: number): string[] =>
    lanes.flatMap((lane, index) => [...(index > 0 ? [''] : []), ...laneHeader(lane, view, width)]);

function taskBlock(group: Group, at: number, view: ColumnView, width: number, markdown: Markdown): string[] {
    const style = paint(view);
    const heading = group.task === null ? [] : [style.bold(style.cyan(`▌ ${group.task.name === '' ? view.messages.taskNumber(at + 1) : group.task.name}`))];
    const recap = group.task === null ? [] : ['', ...body(group.task, group.lanes, width, markdown, view)];
    return [...heading, ...headersOf(group.lanes, view, width), ...recap];
}

export function present(view: ColumnView, width: number, markdown: Markdown): string[] {
    const style = paint(view);
    if (view.tab === null || view.tab.lanes.length === 0) {
        return wrap(view.messages.waitingForAgent, width).map(style.gray);
    }
    const groups = groupsOf(view.tab.lanes, view.recap?.tasks ?? []);
    const rule = style.gray('─'.repeat(width));
    const end = errorLines(view.recap, width, view);
    if (groups.length > 1) {
        const blocks = groups.map((group, at) => taskBlock(group, at, view, width, markdown));
        return [...warningLines(view, width), ...recapMeta(view, width), '', ...blocks.reduce<string[]>((lines, block, at) => lines.concat(at > 0 ? ['', rule] : [], block), []), ...end];
    }
    return [
        ...warningLines(view, width),
        ...headersOf(view.tab.lanes, view, width),
        '',
        rule,
        ...recapMeta(view, width),
        '',
        ...body(groups[0]?.task ?? null, view.tab.lanes, width, markdown, view),
        ...end,
    ];
}

export type Mode = 'column' | 'modal' | 'bar';

export function footer(width: number, mode: Mode, m: Messages, style: Style = coloured): string {
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

function leadOf(task: RecapTask): { needs: string | null; now: string | null } {
    if (task.sections === null) {
        return { needs: firstItem(task.markdown, 'needs'), now: firstItem(task.markdown, 'now') };
    }
    const lead = headlineOf(task.sections);
    return { needs: lead?.kind === 'needs' ? lead.text : null, now: lead?.kind === 'now' ? lead.text : null };
}

function leads(recap: TabRecap | null): { needs: string | null; now: string | null } {
    const found = (recap?.tasks ?? []).map(leadOf);
    return { needs: found.find((lead) => lead.needs !== null)?.needs ?? null, now: found.find((lead) => lead.now !== null)?.now ?? null };
}

function headline(view: ColumnView): string {
    const style = paint(view);
    const shown = (view.compactions ?? []).toSorted((a, b) => b.startedAt - a.startedAt || b.stageAt - a.stageAt)[0];
    if (shown !== undefined) {
        return stageLine(shown, view.now, { messages: view.messages, style }, shown.agent);
    }
    const { needs, now } = leads(view.recap);
    if (needs !== null) {
        return style.red(view.messages.needsYou(needs));
    }
    return now ?? view.recap?.lanes.find((c) => c.claudeRecap !== null)?.claudeRecap ?? view.messages.noRecapShort;
}

const BAR_MIN_HEAD = 20;

const clipTo = (text: string, width: number): string => wrap(text, width)[0] ?? '';

function dot(status: string, m: Messages, style: Style): string {
    return badge(laneStatus(status), m, style).split(' ').slice(0, 1).join('');
}

export function presentBar(view: ColumnView, width: number): string[] {
    const style = paint(view);
    const dots = (view.tab?.lanes ?? []).map((lane) => dot(lane.status, view.messages, style)).join('');
    const head = `${style.bold(style.cyan('📝'))}${dots} ${style.dim(headline(view).split('\n').join(' '))}`;
    const tag = view.version === undefined || view.version === null ? '' : ` · v${view.version}`;
    if (tag === '' || width - tag.length < BAR_MIN_HEAD) {
        return [clipTo(head, width)];
    }
    const clipped = clipTo(head, width - tag.length);
    return [`${clipped}${style.dim(tag)}`];
}
