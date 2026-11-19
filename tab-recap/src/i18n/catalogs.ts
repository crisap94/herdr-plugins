import { english } from './en.ts';
import type { Catalog, Locale } from './messages.ts';
import { spanish } from './es.ts';

const CATALOGS: Readonly<Record<Locale, Catalog>> = { en: english, es: spanish };

export function catalogFor(locale: Locale): Catalog {
    return CATALOGS[locale];
}
