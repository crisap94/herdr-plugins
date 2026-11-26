import type { RecapInput } from '#src/ports/recap-input.ts';
import { brand } from '#src/recap/domain/brand.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { instant } from '#src/recap/domain/time.ts';
import { localTime } from './local-time.ts';
import { element, leaf, type Attributes } from './xml.ts';

export function candidatesOf(input: RecapInput): Text {
    const text = brand<string, 'Text'>;
    if (input.candidates === undefined) {
        return text('');
    }
    const rows = input.candidates.map((one) => {
        const attrs: Attributes = { section: one.section, anchor: text(one.anchor), why: one.why === null ? null : text(one.why), ref: one.ref === null ? null : text(one.ref), agent: one.agent === null ? null : text(one.agent), at: one.at === null ? null : localTime(instant(one.at), instant(input.scope.now), text(input.scope.zone)), flagged: one.flagged ? 'yes' : null };
        return `\n ${leaf('candidate', attrs, text(one.text))}`;
    }).join('');
    return text(`\n${element('candidates', {}, text(rows === '' ? '' : `${rows}\n`))}`);
}
