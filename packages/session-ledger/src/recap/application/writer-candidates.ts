import type { RecapInput } from '#src/ports/recap-input.ts';
import { brand } from '#src/recap/domain/brand.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { localTime } from './local-time.ts';
import { element, leaf } from './xml.ts';

export function candidatesOf(input: RecapInput): Text {
    const text = brand<string, 'Text'>;
    if (input.candidates === undefined) {
        return text('');
    }
    const rows = input.candidates.map((one) => {
        const attrs = { section: one.section, anchor: one.anchor, why: one.why, ref: one.ref, agent: one.agent, at: one.at === null ? null : localTime(one.at, input.tab.now, input.tab.zone), flagged: one.flagged ? 'yes' : null };
        return `\n ${leaf('candidate', attrs, one.text)}`;
    }).join('');
    return text(`\n${element('candidates', {}, rows === '' ? '' : `${rows}\n`)}`);
}
