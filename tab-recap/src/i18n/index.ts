import { must } from '#src/protocol/result.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { en } from './en.ts';
import { es } from './es.ts';
import type { Locale, Messages } from './messages.ts';

export type { AgoUnit, LanguageSource, Locale, Messages } from './messages.ts';
export { languageName, languageSetting, recapLanguageOf } from './legacy.ts';

const CATALOGS: Readonly<Record<Locale, Messages>> = { en, es };

export function messagesFor(locale: Locale): Messages {
    return CATALOGS[locale];
}

const NAMES: Readonly<Record<string, string>> = { en: 'en', english: 'en', inglés: 'en', ingles: 'en', es: 'es', spanish: 'es', español: 'es', espanol: 'es', castellano: 'es' };
const LANGUAGE_NAMES: Readonly<Record<string, string>> = { en: 'English', es: 'Spanish' };
const MAX_LANGUAGE = 30;
const MAX_WORDS = 3;

export function recapLanguageOfSetting(raw: Text | undefined, locale: Locale): Locale | Text {
    const setting = languageSettingOf(raw);
    return setting === 'ui' ? locale : setting;
}

export function languageSettingOf(raw: Text | undefined): Text {
    const text = (raw ?? '').normalize('NFC').replace(/[^\p{L} -]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_LANGUAGE).trim().split(' ').slice(0, MAX_WORDS).join(' ');
    if (text === '' || text.toLowerCase() === 'ui') {
        return must(parseText('ui'));
    }
    return must(parseText(NAMES[text.toLowerCase()] ?? text));
}

export function languageNameOf(language: Text): Text {
    return must(parseText(LANGUAGE_NAMES[language] ?? language));
}
