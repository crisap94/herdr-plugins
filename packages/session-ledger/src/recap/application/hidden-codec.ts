import { SECTION_IDS, isSection } from '#src/recap/domain/fact.ts';
import type { Section } from '#src/recap/domain/fact.ts';
import type { PositiveCount } from '#src/recap/domain/writer-view.ts';
import { positiveCount } from '#src/recap/domain/writer-view.ts';
import type { HiddenCounts } from '#src/recap/domain/writer-view.ts';
import { brand } from '#src/recap/domain/brand.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { element } from './xml.ts';

export function serializeHidden(counts: HiddenCounts): Text {
    return brand<string, 'Text'>(SECTION_IDS.flatMap((section) => {
        const count = counts.get(section);
        return count === undefined ? [] : [`\n ${element('hidden', { section, count })}`];
    }).join(''));
}

export function parseHidden(document: Text): HiddenCounts {
    const counts = new Map<Section, PositiveCount>();
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
