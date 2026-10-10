import { SECTION_IDS, isSection } from '#src/recap/domain/fact.ts';
import type { Section } from '#src/recap/domain/fact.ts';
import { positiveCount } from '#src/recap/domain/writer-view.ts';
import type { HiddenCounts } from '#src/recap/domain/writer-view.ts';
import { element } from './xml.ts';

export function serializeHidden(counts: HiddenCounts): string {
    return [...counts.entries()].toSorted(([a], [b]) => SECTION_IDS.indexOf(a) - SECTION_IDS.indexOf(b)).map(([section, count]) => `\n ${element('hidden', { section, count })}`).join('');
}

export function parseHidden(document: string): HiddenCounts {
    const counts = new Map<Section, ReturnType<typeof positiveCount>>();
    for (const match of document.matchAll(/<hidden section="([^"]+)" count="(\d+)"\/>/gu)) {
        const section = match[1];
        const count = Number(match[2]);
        if (!isSection(section) || !Number.isSafeInteger(count) || count < 1 || counts.has(section)) {
            throw new Error('invalid hidden count');
        }
        counts.set(section, positiveCount(count));
    }
    if (document.replace(/<hidden section="[^"]+" count="\d+"\/>/gu, '').trim() !== '') {
        throw new Error('invalid hidden elements');
    }
    return counts;
}
