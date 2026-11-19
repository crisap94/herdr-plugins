import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { languageNameOf, languageSettingOf, recapLanguageOfSetting } from './language.ts';
import type { AgoUnit, Locale } from './messages.ts';
import { agoTextOf } from './relative.ts';

const optionalText = (raw: string | undefined): Text | undefined => (raw === undefined ? undefined : must(parseText(raw)));

export function recapLanguageOf(raw: string | undefined, locale: Locale): string {
    return recapLanguageOfSetting(optionalText(raw), locale);
}

export function languageSetting(raw: string | undefined): string {
    return languageSettingOf(optionalText(raw));
}

export function languageName(language: string): string {
    return languageNameOf(must(parseText(language)));
}

export function agoIn(locale: string): (amount: number, unit: AgoUnit) => string {
    const ago = agoTextOf(must(parseText(locale)));
    return (amount, unit) => ago(must(parseCount(amount)), unit);
}
