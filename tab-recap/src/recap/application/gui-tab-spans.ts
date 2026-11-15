import type { LaneWeb } from '#src/ports/tab-views.ts';
import { must } from '#src/protocol/result.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import type { GuiSpan } from '#src/recap/domain/gui-tab-parts.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { isSafeUrl } from '#src/recap/render/hyperlink.ts';
import { linkify } from '#src/recap/render/links.ts';

export type Texted = Pick<Fact, 'text'>;

export function spansOf(source: Texted, webs: readonly (LaneWeb | null | undefined)[]): readonly GuiSpan[] | null {
    const spans = linkify(source.text, webs).map((piece): GuiSpan => ({ text: must(parseText(piece.text)), url: piece.url !== undefined && isSafeUrl(piece.url) ? must(parseText(piece.url)) : null }));
    return spans.some((span) => span.url !== null) ? spans : null;
}
