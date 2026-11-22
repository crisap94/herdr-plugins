import { must } from '#src/protocol/result.ts';
import { environmentName, type EnvironmentName } from '#src/recap/domain/backend.ts';
import { parseFsPath, type FsPath } from '#src/recap/domain/fs-path.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';

export const JEV_KEY_FILE = ['.config', 'typesafe-api-key'] as const;

export type JevKeySetting = (key: EnvironmentName) => Text | undefined;
export type JevKeyFile = (path: FsPath) => Text | null;

const KEY_NAMES: readonly EnvironmentName[] = [environmentName('TAB_RECAP_JEV_KEY'), environmentName('TYPESAFE_API_KEY')];

const clean = (raw: Text | null | undefined): Text | null => {
    const key = (raw ?? '').trim();
    return key === '' ? null : must(parseText(key));
};

export function jevKey(get: JevKeySetting, read: JevKeyFile, home: Text): Text | null {
    for (const name of KEY_NAMES) {
        const set = clean(get(name));
        if (set !== null) return set;
    }
    const path = parseFsPath([home, ...JEV_KEY_FILE].join('/'));
    if (path.kind !== 'ok') return null;
    const content = read(path.value);
    return clean(content === null ? null : must(parseText(content.split('\n')[0] ?? '')));
}
