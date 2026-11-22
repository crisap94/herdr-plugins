import { appendFileSync, existsSync, readFileSync } from 'node:fs';

import type { Row } from '#src/adapters/transcripts/jsonl.ts';
import { must } from '#src/protocol/result.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';

export function readJsonl(path: Text): readonly unknown[] {
    return existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter((line) => line.trim() !== '').map((line): unknown => JSON.parse(line)) : [];
}

export const appendJsonl = (path: FsPath, record: Row): void => { appendFileSync(path, `${JSON.stringify(record)}\n`); };

export const doneKeys = (path: Text, key: Text): ReadonlySet<Text> => new Set(readJsonl(path).map((record) => must(parseText(String(Reflect.get(Object(record), key))))));
