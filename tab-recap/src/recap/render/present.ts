import type { Messages } from '#src/i18n/messages.ts';
import { sectionOf } from '#src/i18n/sections.ts';
import type { SectionId } from '#src/i18n/sections.ts';
import { laneStatus } from '#src/recap/domain/status.ts';
import type { LaneStatus } from '#src/recap/domain/status.ts';
import { DEFAULT_MARK } from '#src/ports/extension.ts';
import { isScreenSource } from '#src/ports/screens.ts';
import type { Note } from '#src/ports/extension.ts';
import type { LaneCursor, TabLane, TabRecap, TabView } from '#src/ports/recap-store.ts';
import { headlineOf, renderRecap } from '#src/recap/application/recap-shape.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';
import { groupsOf } from './groups.ts';
import type { Group } from './groups.ts';
import { elapsed, plainMarkdown, style, wrap } from './wrap.ts';

export interface ColumnView {
    readonly tab: TabView | null;
    readonly recap: TabRecap | null;
    readonly notes: ReadonlyMap<string, readonly Note[]>;
    readonly warnings: readonly string[];
    readonly now: number;
    readonly messages: Messages;
}

export type Markdown = (markdown: string, width: number) => readonly string[] | null;

const PROMPT_LINES = 2;

const ago = (view: ColumnView, ms: number): string => view.messages.ago(elapsed(ms).amount, elapsed(ms).unit);

export function badge(status: LaneStatus, m: Messages): string {
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
    return (view.notes.get(pane) ?? []).flatMap((note) => {
        const when = note.at === null ? '' : ` ${ago(view, view.now - note.at)}`;
        const details = note.details.length > 0 ? ` · ${note.details.join(' · ')}` : '';
        return wrap(`${note.mark ?? DEFAULT_MARK} ${note.label}${when}${details}`, width, '  ').map(style.blue);
    });
}

/** The live prompt if there is one, else what the last recap saw. */
function promptLines(lane: TabLane, cursor: LaneCursor | undefined, width: number): string[] {
    const prompt = lane.lastPrompt ?? cursor?.lastPrompt ?? null;
    return prompt === null ? [] : wrap(`› ${prompt.split('\n').join(' ')}`, width, '  ').slice(0, PROMPT_LINES).map(style.dim);
}

/** Who is in the tab: one short header per lane. The recap below is the tab's, not the lane's. */
function laneHeader(lane: TabLane, view: ColumnView, width: number): string[] {
    const cursor = view.recap?.lanes.find((c) => c.pane === lane.pane);
    const title = cursor?.title ?? lane.title ?? lane.pane;
    return [
        ...wrap(title, width).map((line) => style.bold(line)),
        ...wrap([badge(laneStatus(lane.status), view.messages), style.gray(`${lane.agent} ${lane.pane}${cursor !== undefined && isScreenSource(cursor.transcript) ? ` ${view.messages.fromScreen}` : ''}`)].join(style.gray(' · ')), width, '  '),
        ...noteLines(view, lane.pane, width),
        ...promptLines(lane, cursor, width),
    ];
}

function recapMeta(view: ColumnView, width: number): string[] {
    const { recap, messages: m } = view;
    const at = recap?.at ?? null;
    const parts = [
        style.bold(style.cyan(m.recapTitle)),
        at === null ? null : style.gray(ago(view, view.now - at)),
        recap?.backend ?? null,
        recap?.running === true ? style.magenta(m.updating) : null,
    ].filter((part) => part !== null);
    return wrap(parts.join(style.gray(' · ')), width, '  ');
}

/** A task's Markdown: drawn from its sections in the interface language; a recap from before the fixed structure shows as it was written. */
function markdownOf(task: RecapTask | null, m: Messages): string {
    if (task === null) {
        return '';
    }
    return task.sections === null ? task.markdown : renderRecap(task.sections, m.locale);
}

function body(recap: TabRecap | null, task: RecapTask | null, width: number, markdown: Markdown, m: Messages): string[] {
    const drawn = markdownOf(task, m);
    // the fixed structure is laid out here, never by glow: one blank line between sections, none after a heading
    if (task !== null && task.sections !== null) {
        return plainMarkdown(drawn, width);
    }
    if (drawn !== '') {
        return [...(markdown(drawn, width) ?? plainMarkdown(drawn, width))];
    }
    const theirs = (recap?.lanes ?? []).flatMap((c) => (c.claudeRecap === null ? [] : [c.claudeRecap]));
    if (theirs.length > 0) {
        return [style.gray(m.claudeOwn), ...theirs.flatMap((text) => wrap(text, width).map(style.italic))];
    }
    return wrap(m.noRecapYet, width).map(style.gray);
}

function errorLines(recap: TabRecap | null, width: number, m: Messages): string[] {
    const error = recap?.error ?? null;
    return error === null ? [] : ['', ...wrap(m.recapError(error), width).map(style.red)];
}

function warningLines(warnings: readonly string[], width: number): string[] {
    return warnings.length === 0 ? [] : [...warnings.flatMap((warning) => wrap(warning, width).map(style.red)), ''];
}

const headersOf = (lanes: readonly TabLane[], view: ColumnView, width: number): string[] =>
    lanes.flatMap((lane, index) => [...(index > 0 ? [''] : []), ...laneHeader(lane, view, width)]);

/** One task of a tab with several: its name, its lanes, then its recap. A lane no task holds yet has only its header. */
function taskBlock(group: Group, at: number, view: ColumnView, width: number, markdown: Markdown): string[] {
    const heading = group.task === null ? [] : [style.bold(style.cyan(`▌ ${group.task.name === '' ? view.messages.taskNumber(at + 1) : group.task.name}`))];
    const recap = group.task === null ? [] : ['', ...body(view.recap, group.task, width, markdown, view.messages)];
    return [...heading, ...headersOf(group.lanes, view, width), ...recap];
}

/** The whole column, as lines: who is in the tab, then its recap — one per task, each under its task's name. Total; no I/O. */
export function present(view: ColumnView, width: number, markdown: Markdown): string[] {
    if (view.tab === null || view.tab.lanes.length === 0) {
        return wrap(view.messages.waitingForAgent, width).map(style.gray);
    }
    const groups = groupsOf(view.tab.lanes, view.recap?.tasks ?? []);
    const rule = style.gray('─'.repeat(width));
    const end = errorLines(view.recap, width, view.messages);
    if (groups.length > 1) {
        const blocks = groups.map((group, at) => taskBlock(group, at, view, width, markdown));
        return [...warningLines(view.warnings, width), ...recapMeta(view, width), '', ...blocks.reduce<string[]>((lines, block, at) => lines.concat(at > 0 ? ['', rule] : [], block), []), ...end];
    }
    return [
        ...warningLines(view.warnings, width),
        ...headersOf(view.tab.lanes, view, width),
        '',
        rule,
        ...recapMeta(view, width),
        '',
        ...body(view.recap, groups[0]?.task ?? null, width, markdown, view.messages),
        ...end,
    ];
}

export type Mode = 'column' | 'modal' | 'bar';

/** The longest hint that fits: a cut-off hint reads as a bug. */
export function footer(width: number, mode: Mode, m: Messages): string {
    const hints = mode === 'bar' ? [] : m.hints[mode];
    return style.gray(hints.find((hint) => hint.length <= width) ?? '');
}

const PLAIN_BULLET = /^\s*[-*+]\s+/;

/** The first bullet of a recap section, in plain text; the heading may be in any language the plugin writes. */
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

/** What leads one task: from its data; a recap from before the fixed structure is read from its Markdown. */
function leadOf(task: RecapTask): { needs: string | null; now: string | null } {
    if (task.sections === null) {
        return { needs: firstItem(task.markdown, 'needs'), now: firstItem(task.markdown, 'now') };
    }
    const lead = headlineOf(task.sections);
    return { needs: lead?.kind === 'needs' ? lead.text : null, now: lead?.kind === 'now' ? lead.text : null };
}

/** What leads the tab: the most urgent "needs you" of ANY task, else the first "now". */
function leads(recap: TabRecap | null): { needs: string | null; now: string | null } {
    const found = (recap?.tasks ?? []).map(leadOf);
    return { needs: found.find((lead) => lead.needs !== null)?.needs ?? null, now: found.find((lead) => lead.now !== null)?.now ?? null };
}

/** What the bar says: what needs the operator first, else what is happening now. */
function headline(view: ColumnView): string {
    const { needs, now } = leads(view.recap);
    if (needs !== null) {
        return style.red(view.messages.needsYou(needs));
    }
    return now ?? view.recap?.lanes.find((c) => c.claudeRecap !== null)?.claudeRecap ?? view.messages.noRecapShort;
}

const clipTo = (text: string, width: number): string => wrap(text, width)[0] ?? '';

/** A lane's status as one glyph: the bar has no room for words. */
function dot(status: string, m: Messages): string {
    return badge(laneStatus(status), m).split(' ').slice(0, 1).join('');
}

/** The phone's shape: ONE row along the bottom of a narrow tab — 📝, each lane's dot, the headline. A tap opens the modal. */
export function presentBar(view: ColumnView, width: number): string[] {
    const dots = (view.tab?.lanes ?? []).map((lane) => dot(lane.status, view.messages)).join('');
    const line = `${style.bold(style.cyan('📝'))}${dots} ${style.dim(headline(view).split('\n').join(' '))}`;
    return [clipTo(line, width)];
}
