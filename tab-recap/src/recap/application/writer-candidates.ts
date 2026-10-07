// The reconcile step's candidates as the `candidates` element of the writer's document (schema/recap-input.dtd); nothing when the run has none to reconcile.
import type { RecapInput } from '#src/ports/recap-input.ts';
import { localTime } from './local-time.ts';
import { element, leaf } from './xml.ts';

export function candidatesOf(input: RecapInput): string {
    if (input.candidates === undefined) {
        return '';
    }
    const rows = input.candidates.map((one) => {
        const attrs = { section: one.section, anchor: one.anchor, why: one.why, ref: one.ref, agent: one.agent, at: one.at === null ? null : localTime(one.at, input.tab.now, input.tab.zone), flagged: one.flagged ? 'yes' : null };
        return `\n ${leaf('candidate', attrs, one.text)}`;
    }).join('');
    return `\n${element('candidates', {}, rows === '' ? '' : `${rows}\n`)}`;
}
