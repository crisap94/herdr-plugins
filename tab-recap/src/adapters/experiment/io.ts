import { appendFileSync, existsSync, readFileSync } from 'node:fs';

import type { Row } from '#src/adapters/transcripts/jsonl.ts';
import { must } from '#src/protocol/result.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import { parseText, textOf, type Text } from '#src/recap/domain/text.ts';

export const jsonLines = (path: Text): readonly Text[] => (existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter((line) => line.trim() !== '').map((line) => textOf(line)) : []);

export const appendJsonl = (path: FsPath, record: Row): void => { appendFileSync(path, `${JSON.stringify(record)}\n`); };

export const doneKeys = (path: Text, key: Text): ReadonlySet<Text> => new Set(jsonLines(path).map((line) => {
    const record: unknown = JSON.parse(line);
    if (record === null || record === undefined) {
        throw new TypeError(`cannot read '${key}' of ${String(record)}`);
    }
    return must(parseText(String(Reflect.get(Object(record), key))));
}));
