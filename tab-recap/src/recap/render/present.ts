import type { Messages } from '#src/i18n/messages.ts';
import { sectionOf } from '#src/i18n/sections.ts';
import type { SectionId } from '#src/i18n/sections.ts';
import { laneStatus } from '#src/recap/domain/status.ts';
import type { LaneStatus } from '#src/recap/domain/status.ts';
import type { Note } from '#src/ports/extension.ts';
import type { LaneCursor, TabLane, TabRecap, TabView } from '#src/ports/recap-store.ts';
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
        return wrap(`⚑ ${note.label}${when}${details}`, width, '  ').map(style.blue);
    });
}

function promptLines(cursor: LaneCursor | undefined, width: number): string[] {
    const prompt = cursor?.lastPrompt ?? null;
    return prompt === null ? [] : wrap(`› ${prompt.split('\n').join(' ')}`, width, '  ').slice(0, PROMPT_LINES).map(style.dim);
}

/** Who is in the tab: one short header per lane. The recap below is the tab's, not the lane's. */
function laneHeader(lane: TabLane, view: ColumnView, width: number): string[] {
    const cursor = view.recap?.lanes.find((c) => c.pane === lane.pane);
    const title = cursor?.title ?? lane.title ?? lane.pane;
    return [
        ...wrap(title, width).map((line) => style.bold(line)),
        ...wrap([badge(laneStatus(lane.status), view.messages), style.gray(`${lane.agent} ${lane.pane}`)].join(style.gray(' · ')), width, '  '),
        ...noteLines(view, lane.pane, width),
        ...promptLines(cursor, width),
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

function body(recap: TabRecap | null, width: number, markdown: Markdown, m: Messages): string[] {
    if (recap !== null && recap.markdown !== '') {
        return [...(markdown(recap.markdown, width) ?? plainMarkdown(recap.markdown, width))];
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

/** The whole column, as lines: who is in the tab, then the tab's one recap. Total; no I/O. */
export function present(view: ColumnView, width: number, markdown: Markdown): string[] {
    if (view.tab === null || view.tab.lanes.length === 0) {
        return wrap(view.messages.waitingForAgent, width).map(style.gray);
    }
    const headers = view.tab.lanes.flatMap((lane, index) => [...(index > 0 ? [''] : []), ...laneHeader(lane, view, width)]);
    return [
        ...warningLines(view.warnings, width),
        ...headers,
        '',
        style.gray('─'.repeat(width)),
        ...recapMeta(view, width),
        '',
        ...body(view.recap, width, markdown, view.messages),
        ...errorLines(view.recap, width, view.messages),
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

function headline(view: ColumnView): string {
    const markdown = view.recap?.markdown ?? '';
    const waiting = firstItem(markdown, 'waiting');
    if (waiting !== null) {
        return style.red(view.messages.needsYou(waiting));
    }
    return firstItem(markdown, 'now') ?? view.recap?.lanes.find((c) => c.claudeRecap !== null)?.claudeRecap ?? view.messages.noRecapShort;
}

const clipTo = (text: string, width: number): string => wrap(text, width)[0] ?? '';

/** A lane's status as one glyph: the bar has no room for words. */
function dot(status: string, m: Messages): string {
    return badge(laneStatus(status), m).split(' ').slice(0, 1).join('');
}

/** The phone's shape: ONE row along the top of a narrow tab — 📝, each lane's dot, the headline. A tap opens the modal. */
export function presentBar(view: ColumnView, width: number): string[] {
    const dots = (view.tab?.lanes ?? []).map((lane) => dot(lane.status, view.messages)).join('');
    const line = `${style.bold(style.cyan('📝'))}${dots} ${style.dim(headline(view).split('\n').join(' '))}`;
    return [clipTo(line, width)];
}
