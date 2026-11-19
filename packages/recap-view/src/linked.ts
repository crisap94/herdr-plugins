import type { Web } from './model.ts';
import { hyperlink } from './hyperlink.ts';
import { linkify } from './links.ts';

export function linked(text: string, contexts: readonly (Web | null | undefined)[]): string {
    return linkify(text, contexts).map((piece) => (piece.url === undefined ? piece.text : hyperlink(piece.text, piece.url))).join('');
}
