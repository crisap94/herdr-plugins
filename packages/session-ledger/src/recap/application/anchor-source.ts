import type { RecapInput } from '#src/ports/recap-input.ts';
import { brand } from '#src/recap/domain/brand.ts';
import { foldedOf } from '#src/recap/domain/gates/words.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { clean } from './xml.ts';

export function anchorSource(input: RecapInput): Text {
    const entries = input.transcripts.flatMap((lane) => lane.entries.flatMap((entry) => [entry.text, entry.what ?? '']));
    const notes = input.notes.map((note) => note.text);
    return brand<string, 'Text'>(foldedOf(clean([...entries, ...notes].join('\n'))));
}
