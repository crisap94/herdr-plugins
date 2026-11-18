import { must } from '#src/protocol/result.ts';
import type { Count } from '#src/recap/domain/count.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import type { AgoUnit } from './messages.ts';

const INTL_UNIT: Readonly<Record<AgoUnit, Intl.RelativeTimeFormatUnit>> = { s: 'second', min: 'minute', h: 'hour', d: 'day' };

export function agoTextOf(locale: Text): (amount: Count, unit: AgoUnit) => Text {
    const format = new Intl.RelativeTimeFormat(locale, { style: 'narrow', numeric: 'always' });
    return (amount, unit) => {
        const elapsed: number = amount;
        return must(parseText(format.format(elapsed === 0 ? -0 : -elapsed, INTL_UNIT[unit])));
    };
}
