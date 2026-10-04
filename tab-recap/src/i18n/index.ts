import { en } from './en.ts';
import { es } from './es.ts';
import type { Locale, Messages } from './messages.ts';

export type { AgoUnit, Locale, Messages } from './messages.ts';

const CATALOGS: Readonly<Record<Locale, Messages>> = { en, es };

export function messagesFor(locale: Locale): Messages {
    return CATALOGS[locale];
}

const NAMES: Readonly<Record<string, string>> = { en: 'en', english: 'en', inglés: 'en', ingles: 'en', es: 'es', spanish: 'es', español: 'es', espanol: 'es', castellano: 'es' };
const MAX_LANGUAGE = 30;
const MAX_WORDS = 3;

/**
 * The language a recap is written in, from TAB_RECAP_RECAP_LANG: `ui` (or nothing) follows the UI
 * locale, `en`/`es` are the two with their own headings, anything else is free text — letters,
 * spaces and hyphens only, at most 30 characters and 3 words, because it goes into a model's instructions.
 */
export function recapLanguageOf(raw: string | undefined, locale: Locale): string {
    const setting = languageSetting(raw);
    return setting === 'ui' ? locale : setting;
}

/** The setting as it is stored: `ui`, `en`, `es` or sanitised free text. */
export function languageSetting(raw: string | undefined): string {
    const text = (raw ?? '').normalize('NFC').replace(/[^\p{L} -]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_LANGUAGE).trim().split(' ').slice(0, MAX_WORDS).join(' ');
    if (text === '' || text.toLowerCase() === 'ui') {
        return 'ui';
    }
    return NAMES[text.toLowerCase()] ?? text;
}

/** What the model is told the language is called. */
export function languageName(language: string): string {
    return { en: 'English', es: 'Spanish' }[language] ?? language;
}
