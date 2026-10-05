/** The recap's seven sections: the id is what the code means, `en`/`es` are what the heading says, `hint` is for the model. */
export interface Section {
    readonly id: SectionId;
    readonly en: string;
    readonly es: string;
    readonly hint: string;
}

export type SectionId = 'goal' | 'now' | 'needs' | 'done' | 'decisions' | 'next' | 'links';

/** Always all seven, always in this order. */
export const SECTIONS: readonly Section[] = [
    { id: 'goal', en: 'Goal', es: 'Objetivo', hint: 'what the operator wants, in one short sentence' },
    { id: 'now', en: 'Now', es: 'Ahora', hint: 'what the agents are doing right now' },
    { id: 'needs', en: 'Needs you', es: 'Te necesita', hint: 'what the operator must answer or approve before work can go on' },
    { id: 'done', en: 'Done', es: 'Hecho', hint: 'what is finished, newest first' },
    { id: 'decisions', en: 'Decisions', es: 'Decisiones', hint: 'choices made, and why when it is not obvious' },
    { id: 'next', en: 'Next', es: 'Siguiente', hint: 'what comes next' },
    { id: 'links', en: 'Links', es: 'Enlaces', hint: 'files, branches, merge requests, commands, hosts worth keeping' },
];

/** Headings of recaps written before the fixed structure; still recognised until such a recap is rewritten. */
const LEGACY: Readonly<Record<string, SectionId>> = {
    'waiting on you': 'needs',
    'esperando tu respuesta': 'needs',
    'key refs': 'links',
    'referencias clave': 'links',
    'próximos pasos': 'next',
};

/** The section a Markdown heading names, in any language the plugin writes headings in. */
export function sectionOf(heading: string): SectionId | null {
    const text = heading.replace(/^#+\s*/, '').trim().toLowerCase();
    const legacy = Object.entries(LEGACY).find(([name]) => text.startsWith(name));
    return legacy?.[1] ?? SECTIONS.find((section) => text.startsWith(section.en.toLowerCase()) || text.startsWith(section.es.toLowerCase()))?.id ?? null;
}
