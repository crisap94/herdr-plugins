import { appendFileSync, existsSync, readFileSync } from 'node:fs';

export function readJsonl(path: string): readonly unknown[] {
    return existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter((line) => line.trim() !== '').map((line): unknown => JSON.parse(line)) : [];
}

export const appendJsonl = (path: string, record: object): void => { appendFileSync(path, `${JSON.stringify(record)}\n`); };

export const doneKeys = (path: string, key: string): ReadonlySet<string> => new Set((readJsonl(path) as readonly Record<string, unknown>[]).map((record) => String(record[key])));
