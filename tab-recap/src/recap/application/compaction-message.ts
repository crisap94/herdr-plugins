// What an agent is told when it is compacted: the operator's own words, first person, English. Pure.
// The agent never hears where this comes from: no template or reference here may name the plugin, its column or its tabs.
import { linkify } from '#src/recap/render/links.ts';
import type { LaneWeb } from '#src/ports/tab-views.ts';
import type { RecapSections } from '#src/recap/domain/shape.ts';

/** The longest a message may be; the note and the goal are never cut to fit. */
export const MESSAGE_LIMIT = 1500;

/** The most the popup lets the operator type as a note. */
export const NOTE_LIMIT = 280;

export interface Material {
    readonly sections: RecapSections;
    /** where the lane's repository lives on the web, to turn references into URLs; null when unknown */
    readonly web: LaneWeb | null;
    /** the operator's optional focus note; null or blank leaves no trace in the message */
    readonly note: string | null;
}

/** The priorities, in order; an empty one is omitted. */
interface Priorities {
    readonly goal: string;
    readonly decisions: readonly string[];
    readonly waiting: readonly string[];
    readonly unfinished: readonly string[];
    readonly rules: readonly string[];
    readonly references: readonly string[];
}

/** A reference as the operator would write it for someone without the context: the words, then the page they go to. */
function resolved(line: string, web: LaneWeb | null): string {
    return linkify(line, [web]).map((piece) => (piece.url === undefined || piece.url === piece.text ? piece.text : `${piece.text} (${piece.url})`)).join('');
}

const prioritiesOf = ({ sections, web }: Material): Priorities => ({
    goal: sections.goal,
    decisions: sections.decisions,
    waiting: sections.needs,
    unfinished: [...sections.now, ...sections.next],
    rules: sections.rules,
    references: sections.links.map((line) => resolved(line, web)),
});

const noteOf = (material: Material): string => (material.note ?? '').replace(/\s+/g, ' ').trim();

const stopped = (text: string): string => (/[.?!]$/u.test(text) ? text : `${text}.`);
const list = (label: string, items: readonly string[]): string[] => (items.length === 0 ? [] : [`- ${label}: ${stopped(items.join('; '))}`]);

/** The lines of the priorities, in the fixed order. */
function linesOf(note: string, p: Priorities, lead: string): string[] {
    const priorities = [
        ...(note === '' ? [] : [`- Above all, keep: ${note}`]),
        ...(p.goal === '' ? [] : [`- What I want: ${p.goal}`]),
        ...list('Decisions we made, and why', p.decisions),
        ...list('Questions waiting for my answer', p.waiting),
        ...list('Unfinished work and next steps', p.unfinished),
        ...list('Standing rules I gave you', p.rules),
        ...list('Exact references to keep as written', p.references),
    ];
    return priorities.length === 0 ? [lead] : [lead, ...priorities];
}

const CUTS: readonly ('references' | 'unfinished' | 'decisions')[] = ['references', 'unfinished', 'decisions'];

/** Written once, then cut to fit one item at a time, from the end: references first, then next steps, then decisions. */
function fitted(build: (p: Priorities) => string, p: Priorities): string {
    const key = CUTS.find((cut) => p[cut].length > 0);
    return build(p).length <= MESSAGE_LIMIT || key === undefined ? build(p) : fitted(build, { ...p, [key]: p[key].slice(0, -1) });
}

const KEEP = 'When you summarize this conversation, keep these, most important first:';
const DROP = 'Drop raw command output, the details of steps that are finished, and dead ends we already resolved.';
const CARRY_ON = 'Keep these in mind from here on. Nothing needs doing yet: do not start anything or run any command, just answer "ok".';

/** The priorities as numbered clauses of one line: `(1) … (2) …`. */
function numbered(bullets: readonly string[]): string[] {
    return bullets.map((bullet, at) => `(${at + 1}) ${bullet.replace(/^- /u, '')}`);
}

/**
 * What follows `/compact` for an agent that takes instructions with it: ONE line, because Claude Code treats a pasted
 * multi-line block as pasted content and never runs the command. It is typed, not pasted.
 */
export function guidanceOf(material: Material): string {
    const note = noteOf(material);
    return fitted((p) => {
        const [lead = KEEP, ...bullets] = linesOf(note, p, KEEP);
        return [lead, ...numbered(bullets), DROP].join(' ').replace(/\s+/gu, ' ');
    }, prioritiesOf(material));
}

/** For an agent whose `/compact` takes none: sent once it is idle again, so the facts survive its own summary. */
export function restoreOf(material: Material): string {
    const note = noteOf(material);
    return fitted((p) => [...linesOf(note, p, 'We just compacted this conversation. This is where things stand:'), CARRY_ON].join('\n'), prioritiesOf(material));
}
