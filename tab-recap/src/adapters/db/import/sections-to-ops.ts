// A recap stored as sections (the 1.x JSON files) as the operations that make its facts: one add per line, in the order they were drawn.
import type { RecapSections } from '#src/recap/domain/shape.ts';
import type { Operation } from '#src/recap/domain/ops.ts';
import { isSection } from '#src/recap/domain/fact.ts';
import { itemsOf } from '../sections-rows.ts';
import { whyOf } from './items-to-facts.ts';

export const opsOfSections = (sections: RecapSections): readonly Operation[] =>
    itemsOf(sections).flatMap((item) => (isSection(item.section)
        ? [{ op: 'add' as const, section: item.section, text: item.text, why: item.section === 'decisions' ? whyOf(item.text) : null, ref: null, at: null, agent: null }]
        : []));
