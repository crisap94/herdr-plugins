/** The recap's seven sections: the id is what the code means, `en`/`es` are what the heading says, `hint` is for the model. */
export interface Section {
    readonly id: SectionId;
    readonly en: string;
    readonly es: string;
    readonly hint: string;
}

export type SectionId = 'goal' | 'now' | 'waiting' | 'done' | 'decisions' | 'next' | 'refs';

export const SECTIONS: readonly Section[] = [
    { id: 'goal', en: 'Goal', es: 'Objetivo', hint: 'what the operator ultimately wants, 1-3 bullets' },
    { id: 'now', en: 'Now', es: 'Ahora', hint: 'what the agent is doing or just did, and its state' },
    { id: 'waiting', en: 'Waiting on you', es: 'Esperando tu respuesta', hint: 'questions or approvals the agent needs from the operator' },
    { id: 'done', en: 'Done', es: 'Hecho', hint: 'finished work, newest first, concrete results' },
    { id: 'decisions', en: 'Decisions', es: 'Decisiones', hint: 'choices made and why, including operator preferences' },
    { id: 'next', en: 'Next', es: 'Próximos pasos', hint: 'open items and the planned next steps' },
    { id: 'refs', en: 'Key refs', es: 'Referencias clave', hint: 'files, branches, MRs/PRs, commands, hosts, numbers worth keeping' },
];

/** The section a Markdown heading names, in any language the plugin writes headings in. */
export function sectionOf(heading: string): SectionId | null {
    const text = heading.replace(/^#+\s*/, '').trim().toLowerCase();
    return SECTIONS.find((section) => text.startsWith(section.en.toLowerCase()) || text.startsWith(section.es.toLowerCase()))?.id ?? null;
}
