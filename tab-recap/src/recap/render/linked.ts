import type { LaneWeb } from '#src/ports/tab-views.ts';
import { hyperlink } from './hyperlink.ts';
import { linkify } from './links.ts';

export function linked(text: string, contexts: readonly (LaneWeb | null | undefined)[]): string {
    return linkify(text, contexts).map((piece) => (piece.url === undefined ? piece.text : hyperlink(piece.text, piece.url))).join('');
}
