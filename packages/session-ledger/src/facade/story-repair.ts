import type { Text } from '#src/contract/kernel.ts';
import type { Curated } from '#src/contract/models.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { STORY_TOO_LONG, type Curation } from './curation.ts';

export type StoryReading = (answer: Curated) => Curation;

export const storyRepair = (document: Text, answer: Text, checked: Curation): Text => {
    const lines: string[] = [document, '', '<previous-answer>', answer, '</previous-answer>', '', '<refused>'];
    let tooLong = false;
    for (const why of checked.refused) {
        lines.push(`- ${why}`);
        tooLong = tooLong || why.startsWith(STORY_TOO_LONG);
    }
    if (checked.story === null && !tooLong) {
        lines.push('- no paragraph');
    }
    lines.push('</refused>', '', 'Your previous answer, in <previous-answer>, had problems, listed in <refused>. Answer again with the whole JSON object: keep the merges that were not refused, fix or leave out each refused one, and write the paragraph.');
    const built = parseText(lines.join('\n'));
    return built.kind === 'ok' ? built.value : document;
};

export const acceptedRepair = (first: Curated, repair: Curated, reading: StoryReading): Curated => {
    if (repair.kind !== 'curated') {
        return first;
    }
    const rechecked = reading(repair).refused;
    return rechecked.some((why) => why === 'the answer is not JSON' || why === 'the answer is not an object') ? first : repair;
};
