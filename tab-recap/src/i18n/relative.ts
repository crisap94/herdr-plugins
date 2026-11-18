import { must } from '#src/protocol/result.ts';
import type { Count } from '#src/recap/domain/count.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import type { AgoUnit } from './messages.ts';

export { agoIn } from './legacy.ts';

const INTL_UNIT: Readonly<Record<AgoUnit, Intl.RelativeTimeFormatUnit>> = { s: 'second', min: 'minute', h: 'hour', d: 'day' };

export function agoTextOf(locale: Text): (amount: Count, unit: AgoUnit) => Text {
    const format = new Intl.RelativeTimeFormat(locale, { style: 'narrow', numeric: 'always' });
    return (amount, unit) => must(parseText(format.format(amount === 0 ? -0 : -amount, INTL_UNIT[unit])));
}
