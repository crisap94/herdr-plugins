import { appendFileSync, existsSync, readFileSync } from 'node:fs';

import { parseRow, type Row } from '#src/adapters/transcripts/jsonl.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';

export { appendJsonl, doneKeys, readJsonl } from './legacy.ts';

export function readRecords(path: FsPath): readonly Row[] {
    if (!existsSync(path)) {
        return [];
    }
    return readFileSync(path, 'utf8').split('\n').filter((line) => line.trim() !== '').map((line): Row => {
        const row = parseRow(JSON.parse(line));
        if (row.kind !== 'ok') {
            throw new Error(`${path}: a line is not a JSON object`);
        }
        return row.value;
    });
}

export function appendRecord(path: FsPath, record: Row): void {
    appendFileSync(path, `${JSON.stringify(record)}\n`);
}
