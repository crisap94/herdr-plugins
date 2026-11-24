import type { Web } from '@stateforge-labs/recap-view';
import { must } from '@stateforge-labs/session-ledger';
import type { Fact } from '@stateforge-labs/session-ledger';
import type { GuiSpan } from '#src/recap/domain/gui-tab-parts.ts';
import { parseText } from '@stateforge-labs/session-ledger';
import { isSafeUrl } from '@stateforge-labs/recap-view/unstable/hyperlink.ts';
import { linkify } from '@stateforge-labs/recap-view/unstable/links.ts';

export type Texted = Pick<Fact, 'text'>;

export function spansOf(source: Texted, webs: readonly (Web | null | undefined)[]): readonly GuiSpan[] | null {
    const spans = linkify(source.text, webs).map((piece): GuiSpan => ({ text: must(parseText(piece.text)), url: piece.url !== undefined && isSafeUrl(piece.url) ? must(parseText(piece.url)) : null }));
    return spans.some((span) => span.url !== null) ? spans : null;
}
