// The regions of the expanded view, each as wrapped lines for one column width: head, goal, now, needs you, decisions,
// timeline, next, rules, links, session. A region with nothing in it draws nothing. Pure.
import type { Fact } from '#src/recap/domain/fact.ts';
import type { SessionFacts } from '#src/recap/domain/session-facts.ts';
import type { Messages } from '#src/i18n/messages.ts';
import { SECTIONS } from '#src/i18n/sections.ts';
import type { Story } from '#src/ports/stories.ts';
import type { LaneWeb } from '#src/ports/tab-views.ts';
import { linked } from './linked.ts';
import { sessionLines } from './session-lines.ts';
import { clockOf, dateLines, dayOf, timelineOf } from './timeline.ts';
import { elapsed, visibleLength, wrap } from './wrap.ts';
import type { Style } from './wrap.ts';

export interface Draw {
    /** the cells of one column */
    readonly width: number;
    readonly style: Style;
    readonly messages: Messages;
    readonly now: number;
    readonly zone: string;
    readonly webs: readonly (LaneWeb | null | undefined)[];
}

export interface TaskData {
    readonly facts: readonly Fact[];
    readonly story: Story | null;
    readonly curating: boolean;
}

export type RegionId = 'head' | 'goal' | 'now' | 'needs' | 'decisions' | 'timeline' | 'next' | 'rules' | 'links' | 'session';
export type Regions = Readonly<Record<RegionId, readonly string[]>>;

const headingOf = (id: Exclude<RegionId, 'head'>, m: Messages): string => {
    const named = SECTIONS.find((section) => section.id === id);
    return named === undefined ? m.expanded[id as 'timeline' | 'rules' | 'session'] : named[m.locale];
};

const titled = (id: Exclude<RegionId, 'head'>, body: readonly string[], draw: Draw): readonly string[] =>
    body.length === 0 ? [] : [draw.style.bold(draw.style.cyan(headingOf(id, draw.messages).toUpperCase())), ...body];

const open = (facts: readonly Fact[], section: Fact['section']): readonly Fact[] => facts.filter((fact) => fact.section === section && fact.state === 'open');
const newest = (facts: readonly Fact[]): readonly Fact[] => facts.toSorted((a, b) => b.lastAt - a.lastAt);

const text = (fact: Fact, draw: Draw): string => linked(fact.agent === null ? fact.text : `${fact.agent} · ${fact.text}`, draw.webs);

const bullets = (facts: readonly Fact[], draw: Draw): readonly string[] => facts.flatMap((fact) => wrap(`• ${text(fact, draw)}`, draw.width, '  '));

/** `14:02`, or `2026-10-05 14:02` when it is not today */
function stamp(at: number, draw: Draw): string {
    return dayOf(at, draw.zone) === dayOf(draw.now, draw.zone) ? clockOf(at, draw.zone) : `${dayOf(at, draw.zone)} ${clockOf(at, draw.zone)}`;
}

/** `lines` with `tail` after the last one when it fits there, else on a line of its own: a mark is never cut in two. */
function tailed(lines: readonly string[], tail: string, draw: Draw, hang: string): readonly string[] {
    const last = lines.at(-1) ?? '';
    return visibleLength(`${last} · ${tail}`) <= draw.width ? [...lines.slice(0, -1), `${last}${draw.style.gray(' · ')}${tail}`] : [...lines, `${hang}${tail}`];
}

function needs(facts: readonly Fact[], draw: Draw): readonly string[] {
    return open(facts, 'needs').toSorted((a, b) => a.firstAt - b.firstAt).flatMap((fact) => {
        const waited = elapsed(draw.now - fact.firstAt);
        return tailed(wrap(`• ${text(fact, draw)}`, draw.width, '  '), draw.style.yellow(draw.messages.expanded.waiting(waited.amount, waited.unit)), draw, '  ');
    });
}

function decisions(facts: readonly Fact[], draw: Draw): readonly string[] {
    return facts.filter((fact) => fact.section === 'decisions').toSorted((a, b) => b.firstAt - a.firstAt).flatMap((fact) => {
        const when = stamp(fact.firstAt, draw);
        const hang = ' '.repeat(when.length + 1);
        const why = fact.why === null ? [] : wrap(fact.why, draw.width - hang.length).map((line) => draw.style.dim(`${hang}${line}`));
        const body = wrap(`${when} ${text(fact, draw)}`, draw.width, hang);
        return (fact.closedWhy === null ? body : tailed(body, draw.style.gray(draw.messages.expanded.closed(fact.closedWhy)), draw, hang)).concat(why);
    });
}

function timeline(facts: readonly Fact[], draw: Draw): readonly string[] {
    const entries = timelineOf(facts);
    const days = dateLines(entries.map((entry) => entry.drawnAt), draw.now, draw.zone);
    return entries.flatMap((entry, at) => {
        const clock = clockOf(entry.drawnAt, draw.zone);
        const body = wrap(`${clock} ${text(entry.fact, draw)}`, draw.width, '      ');
        const day = days[at];
        return (day === null || day === undefined ? [] : [draw.style.gray(day)]).concat(entry.closed === null ? body : tailed(body, draw.style.gray(draw.messages.expanded.closed(entry.closed)), draw, '      '));
    });
}

function links(facts: readonly Fact[], draw: Draw): readonly string[] {
    return newest(open(facts, 'links')).flatMap((fact) => {
        const shown = fact.ref === null || fact.text.includes(fact.ref) ? fact.text : `${fact.text} ${fact.ref}`;
        return wrap(`• ${linked(shown, draw.webs)}`, draw.width, '  ');
    });
}

/** The curator's paragraph with its time, `updating…` while it runs; nothing when there is neither. */
function head(data: TaskData, draw: Draw): readonly string[] {
    const { story, curating } = data;
    if (story === null && !curating) {
        return [];
    }
    const m = draw.messages.expanded;
    const tags = [...(story === null ? [] : [draw.style.gray(stamp(story.at, draw))]), ...(curating ? [draw.style.magenta(m.updatingStory)] : [])];
    return [[draw.style.bold(draw.style.cyan(m.story.toUpperCase())), ...tags].join(draw.style.gray(' · ')), ...(story === null ? [] : wrap(story.text, draw.width))];
}

/** The session facts: a label in gray and the value; wrapped under the label. */
export function session(facts: SessionFacts, draw: Draw): readonly string[] {
    const lines = sessionLines(facts, { now: draw.now, zone: draw.zone, messages: draw.messages });
    return titled('session', lines.flatMap((line) => wrap(`${draw.style.gray(line.label)} ${line.text}`, draw.width, '  ')), draw);
}

/** Every region of one task except the session, which belongs to the tab. */
export function regionsOf(data: TaskData, draw: Draw): Omit<Regions, 'session'> {
    const { facts } = data;
    const goal = newest(open(facts, 'goal')).slice(0, 1);
    return {
        head: head(data, draw),
        goal: titled('goal', goal.flatMap((fact) => wrap(text(fact, draw), draw.width)), draw),
        now: titled('now', bullets(newest(open(facts, 'now')), draw), draw),
        needs: titled('needs', needs(facts, draw), draw),
        decisions: titled('decisions', decisions(facts, draw), draw),
        timeline: titled('timeline', timeline(facts, draw), draw),
        next: titled('next', bullets(newest(open(facts, 'next')), draw), draw),
        rules: titled('rules', bullets(newest(open(facts, 'rules')), draw), draw),
        links: titled('links', links(facts, draw), draw),
    };
}
