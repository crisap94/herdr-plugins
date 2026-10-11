import { linkify } from '#src/recap/render/links.ts';
import type { LaneWeb } from '#src/ports/tab-views.ts';
import type { RecapSections } from '#src/recap/domain/shape.ts';
import { must } from '#src/protocol/result.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';

export const MESSAGE_LIMIT = 3000;

export const NOTE_LIMIT = 280;

export interface Material {
    readonly sections: RecapSections;
    readonly web: LaneWeb | null;
    readonly note: string | null;
}

interface Priorities {
    readonly goal: Text;
    readonly decisions: readonly Text[];
    readonly waiting: readonly Text[];
    readonly unfinished: readonly Text[];
    readonly rules: readonly Text[];
    readonly references: readonly Text[];
}

type Label = 'Decisions we made, and why' | 'Questions waiting for my answer' | 'Unfinished work and next steps' | 'Standing rules I gave you' | 'Exact references to keep as written';

const KEEP = must(parseText('When you summarize this conversation, keep these, most important first:'));
const DROP = must(parseText('Drop raw command output, the details of steps that are finished, and dead ends we already resolved.'));
const CARRY_ON = must(parseText('Keep these in mind from here on. Nothing needs doing yet: do not start anything or run any command, just answer "ok".'));
const RESTORE_LEAD = must(parseText('We just compacted this conversation. This is where things stand:'));



function resolved(line: Text, web: LaneWeb | null): Text {
    const joined = linkify(line, [web]).map((part) => (part.url === undefined || part.url === part.text ? part.text : `${part.text} (${part.url})`)).join('');
    return must(parseText(joined));
}

const prioritiesOf = ({ sections, web }: Material): Priorities => ({
    goal: must(parseText(sections.goal)),
    decisions: sections.decisions.map((line) => must(parseText(line))),
    waiting: sections.needs.map((line) => must(parseText(line))),
    unfinished: [...sections.now, ...sections.next].map((line) => must(parseText(line))),
    rules: sections.rules.map((line) => must(parseText(line))),
    references: sections.links.map((line) => must(parseText(line))).map((line) => resolved(line, web)),
});

const noteOf = (material: Material): Text => must(parseText((material.note ?? '').replace(/\s+/g, ' ').trim()));

const stopped = (text: Text): Text => (/[.?!]$/u.test(text) ? text : must(parseText(`${text}.`)));

function list(label: Label, items: readonly Text[]): readonly Text[] {
    if (items.length === 0) {
        return [];
    }
    const body = stopped(must(parseText(items.join('; '))));
    return [must(parseText(`- ${label}: ${body}`))];
}

function linesOf(note: Text, p: Priorities, lead: Text): readonly Text[] {
    const priorities = [
        ...(note === '' ? [] : [`- Above all, keep: ${note}`].map((line) => must(parseText(line)))),
        ...(p.goal === '' ? [] : [`- What I want: ${p.goal}`].map((line) => must(parseText(line)))),
        ...list('Decisions we made, and why', p.decisions),
        ...list('Questions waiting for my answer', p.waiting),
        ...list('Unfinished work and next steps', p.unfinished),
        ...list('Standing rules I gave you', p.rules),
        ...list('Exact references to keep as written', p.references),
    ];
    return priorities.length === 0 ? [lead] : [lead, ...priorities];
}

const CUTS: readonly ('references' | 'unfinished' | 'decisions')[] = ['references', 'unfinished', 'decisions'];

function fitted(build: (p: Priorities) => Text, p: Priorities): Text {
    const key = CUTS.find((cut) => p[cut].length > 0);
    return build(p).length <= MESSAGE_LIMIT || key === undefined ? build(p) : fitted(build, { ...p, [key]: p[key].slice(0, -1) });
}

function numbered(bullets: readonly Text[]): readonly Text[] {
    return bullets.map((bullet, at) => must(parseText(`(${at + 1}) ${bullet.replace(/^- /u, '')}`)));
}

export function guidanceOf(material: Material): Text {
    const note = noteOf(material);
    return fitted((p) => {
        const [lead = KEEP, ...bullets] = linesOf(note, p, KEEP);
        return must(parseText([lead, ...numbered(bullets), DROP].join(' ').replace(/\s+/gu, ' ')));
    }, prioritiesOf(material));
}

export function restoreOf(material: Material): Text {
    const note = noteOf(material);
    return fitted((p) => must(parseText([...linesOf(note, p, RESTORE_LEAD), CARRY_ON].join('\n'))), prioritiesOf(material));
}

export function restoreFrom(brief: string): Text {
    return must(parseText(`We just compacted this conversation. This is where things stand: ${brief} Nothing needs doing yet: just answer "ok".`));
}
