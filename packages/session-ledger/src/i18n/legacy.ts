import { SECTIONS } from './sections.ts';
import type { SectionId } from './sections.ts';

const LEGACY: Readonly<Record<string, SectionId>> = {
    'waiting on you': 'needs',
    'esperando tu respuesta': 'needs',
    'key refs': 'links',
    'referencias clave': 'links',
    'próximos pasos': 'next',
};

export function sectionOf(heading: string): SectionId | null {
    const text = heading.replace(/^#+\s*/, '').trim().toLowerCase();
    const legacy = Object.entries(LEGACY).find(([name]) => text.startsWith(name));
    return legacy?.[1] ?? SECTIONS.find((section) => text.startsWith(section.en.toLowerCase()) || text.startsWith(section.es.toLowerCase()))?.id ?? null;
}
