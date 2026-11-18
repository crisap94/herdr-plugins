import { en } from './en.ts';
import { es } from './es.ts';
import type { Locale, Messages } from './messages.ts';

export type { AgoUnit, LanguageSource, Locale, Messages } from './messages.ts';
export { languageNameOf, languageSettingOf, recapLanguageOfSetting } from './language.ts';
export { languageName, languageSetting, recapLanguageOf } from './legacy.ts';

const CATALOGS: Readonly<Record<Locale, Messages>> = { en, es };

export function messagesFor(locale: Locale): Messages {
    return CATALOGS[locale];
}
