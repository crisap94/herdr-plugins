// JSON-lines files of an experiment: read them all, append one record, list what is done. Synchronous and small.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

/** Every record of a JSON-lines file; none when the file is not there. */
export function readJsonl(path: string): readonly unknown[] {
    return existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter((line) => line.trim() !== '').map((line): unknown => JSON.parse(line)) : [];
}

export const appendJsonl = (path: string, record: object): void => { appendFileSync(path, `${JSON.stringify(record)}\n`); };

/** The values of `key` already in a file: what a resumed run skips. */
export const doneKeys = (path: string, key: string): ReadonlySet<string> => new Set((readJsonl(path) as readonly Record<string, unknown>[]).map((record) => String(record[key])));
