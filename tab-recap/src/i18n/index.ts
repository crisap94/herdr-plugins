import { en } from './en.ts';
import { es } from './es.ts';
import type { Locale, Messages } from './messages.ts';

export type { AgoUnit, Catalog, LanguageSource, Locale, Messages } from './messages.ts';
export { catalogFor } from './catalogs.ts';
export { languageNameOf, languageSettingOf, recapLanguageOfSetting } from './language.ts';

const CATALOGS: Readonly<Record<Locale, Messages>> = { en, es };

export function messagesFor(locale: Locale): Messages {
    return CATALOGS[locale];
}
