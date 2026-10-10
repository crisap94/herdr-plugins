import type { AgoUnit } from './messages.ts';

const INTL_UNIT: Readonly<Record<AgoUnit, Intl.RelativeTimeFormatUnit>> = { s: 'second', min: 'minute', h: 'hour', d: 'day' };

export function agoIn(locale: string): (amount: number, unit: AgoUnit) => string {
    const format = new Intl.RelativeTimeFormat(locale, { style: 'narrow', numeric: 'always' });
    return (amount, unit) => format.format(amount === 0 ? -0 : -amount, INTL_UNIT[unit]);
}
