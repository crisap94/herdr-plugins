import type { RecapInput } from '#src/ports/recap-input.ts';
import { foldedOf } from '#src/recap/domain/gates/words.ts';
import { clean } from './xml.ts';

export function anchorSource(input: RecapInput): string {
    const entries = input.transcripts.flatMap((lane) => lane.entries.flatMap((entry) => [entry.text, entry.what ?? '']));
    const notes = input.notes.map((note) => note.text);
    return foldedOf(clean([...entries, ...notes].join('\n')));
}
