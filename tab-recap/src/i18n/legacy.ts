import { must } from '#src/protocol/result.ts';
import type { Count } from '#src/recap/domain/count.ts';
import type { Pid } from '#src/recap/domain/pid.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import type { AutocompactSettingsMessages, Catalog, ChaptersMessages } from './messages.ts';

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
            : T extends Pid
              ? Pid
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

const textOf = (raw: string): Text => must(parseText(raw));

const presenceOf = (flag: boolean): Presence => (flag ? 'present' : 'absent');

export function looseOf(catalog: Catalog): Messages {
    const loose = catalog as unknown as Messages;
    return {
        ...loose,
        autocompactSettings: { ...loose.autocompactSettings, ceilingOverride: (enabled) => catalog.autocompactSettings.ceilingOverride(presenceOf(enabled)) },
        compaction: {
            ...loose.compaction,
            outcome: (agent, outcome, retried, figures) => catalog.compaction.outcome(textOf(agent), outcome, presenceOf(retried), { tokens: textOf(figures.tokens), took: textOf(figures.took) }),
            joined: (agent, noted) => catalog.compaction.joined(textOf(agent), presenceOf(noted)),
        },
        cli: { ...loose.cli, statusDaemon: (pid, off, version) => catalog.cli.statusDaemon(pid, presenceOf(off), version === null ? null : textOf(version)) },
    };
}
