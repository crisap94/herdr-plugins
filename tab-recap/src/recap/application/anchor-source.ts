// What an anchor is looked up in: the text of the turns, the tool calls and the agent notes of the writer's input, as the document carries it
// (terminal escapes gone), with the words folded so a quote and its source compare equal whatever the whitespace and the punctuation.
import type { RecapInput } from '#src/ports/recap-input.ts';
import { foldedOf } from '#src/recap/domain/gates/words.ts';
import { clean } from './xml.ts';

export function anchorSource(input: RecapInput): string {
    const entries = input.transcripts.flatMap((lane) => lane.entries.flatMap((entry) => [entry.text, entry.what ?? '']));
    const notes = input.notes.map((note) => note.text);
    return foldedOf(clean([...entries, ...notes].join('\n')));
}
