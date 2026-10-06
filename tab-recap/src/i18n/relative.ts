// "How long ago", from Intl: the catalogs only choose the locale. Pure.
import type { AgoUnit } from './messages.ts';

const INTL_UNIT: Readonly<Record<AgoUnit, Intl.RelativeTimeFormatUnit>> = { s: 'second', min: 'minute', h: 'hour', d: 'day' };

/** `12s ago` / `hace 12 s`: always in the past, so the amount is negated; `-0` keeps zero reading "0s ago", never "in 0s". */
export function agoIn(locale: string): (amount: number, unit: AgoUnit) => string {
    const format = new Intl.RelativeTimeFormat(locale, { style: 'narrow', numeric: 'always' });
    return (amount, unit) => format.format(amount === 0 ? -0 : -amount, INTL_UNIT[unit]);
}
