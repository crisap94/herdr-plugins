import { must } from '#src/protocol/result.ts';
import type { Count } from '#src/recap/domain/count.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { languageNameOf, languageSettingOf, recapLanguageOfSetting } from './language.ts';
import type { AutocompactSettingsMessages, Catalog, ChaptersMessages, Locale } from './messages.ts';

type Loose<T> = T extends (...args: infer A) => infer R
    ? (...args: { [K in keyof A]: Loose<A[K]> }) => Loose<R>
    : T extends Text
      ? string
      : T extends Count
        ? number
        : T extends Presence
          ? boolean
          : T extends readonly (infer E)[]
            ? readonly Loose<E>[]
            : T extends object
              ? LooseObject<T>
              : T;

type LooseObject<T> = { readonly [K in keyof T]: Loose<T[K]> };

export interface AutocompactSettingsWords extends LooseObject<AutocompactSettingsMessages> {}

export interface ChaptersWords extends LooseObject<ChaptersMessages> {}

export interface Messages extends Omit<LooseObject<Catalog>, 'autocompactSettings' | 'chapters'> {
    readonly autocompactSettings: AutocompactSettingsWords;
    readonly chapters: ChaptersWords;
}

const optionalText = (raw: string | undefined): Text | undefined => (raw === undefined ? undefined : must(parseText(raw)));

const presenceOf = (flag: boolean): Presence => (flag ? 'present' : 'absent');

export function looseOf(catalog: Catalog): Messages {
    const loose = catalog as unknown as Messages;
    return {
        ...loose,
        autocompactSettings: { ...loose.autocompactSettings, ceilingOverride: (enabled) => catalog.autocompactSettings.ceilingOverride(presenceOf(enabled)) },
    };
}

export function recapLanguageOf(raw: string | undefined, locale: Locale): string {
    return recapLanguageOfSetting(optionalText(raw), locale);
}

export function languageSetting(raw: string | undefined): string {
    return languageSettingOf(optionalText(raw));
}

export function languageName(language: string): string {
    return languageNameOf(must(parseText(language)));
}
