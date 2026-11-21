export interface Section {
    readonly id: SectionId;
    readonly en: string;
    readonly es: string;
    readonly hint: string;
}

export type SectionId = 'goal' | 'now' | 'needs' | 'done' | 'decisions' | 'next' | 'links';

export const SECTIONS: readonly Section[] = [
    { id: 'goal', en: 'Goal', es: 'Objetivo', hint: 'what the operator wants, in one short sentence' },
    { id: 'now', en: 'Now', es: 'Ahora', hint: 'what the agents are doing right now' },
    { id: 'needs', en: 'Needs you', es: 'Te necesita', hint: 'what the operator must answer or approve before work can go on' },
    { id: 'done', en: 'Done', es: 'Hecho', hint: 'what is finished, newest first' },
    { id: 'decisions', en: 'Decisions', es: 'Decisiones', hint: 'choices made, and why when it is not obvious' },
    { id: 'next', en: 'Next', es: 'Siguiente', hint: 'what comes next' },
    { id: 'links', en: 'Links', es: 'Enlaces', hint: 'files, branches, merge requests, commands, hosts worth keeping' },
];

export { sectionOf } from './legacy.ts';
