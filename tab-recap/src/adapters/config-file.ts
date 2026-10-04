import { readFileSync } from 'node:fs';
import { writeAtomically } from './fs-recap-store.ts';

/** Sets keys in config.env, keeping every other line, comments included. */
export function setValues(path: string, values: ReadonlyMap<string, string>, parse: (text: string) => ReadonlyMap<string, string>): void {
    let text = '';
    try { text = readFileSync(path, 'utf8'); } catch { /* a new file */ }
    const lines = text === '' ? [] : text.replace(/\n$/, '').split('\n');
    for (const [key, value] of values) {
        const at = lines.findIndex((line) => parse(line).has(key));
        const entry = `${key}=${value}`;
        if (at >= 0) {
            lines[at] = entry;
        } else {
            lines.push(entry);
        }
    }
    writeAtomically(path, `${lines.join('\n')}\n`);
}
