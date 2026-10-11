import type { LastCommit } from '#src/ports/worksite-reader.ts';

const FIELDS_BEFORE_PATH: Readonly<Record<string, number>> = { '1': 8, '2': 9, u: 10, '?': 1 };
const RENAME = '2';
const HASH = /^[0-9a-f]{4,64}$/;

function tailAfter(line: string, spaces: number): string | null {
    let at = 0;
    for (let found = 0; found < spaces; found += 1) {
        const space = line.indexOf(' ', at);
        if (space < 0) {
            return null;
        }
        at = space + 1;
    }
    return line.slice(at);
}

export function parsePorcelainV2(text: string): readonly string[] | null {
    const records = text.split('\0');
    const paths: string[] = [];
    for (let index = 0; index < records.length; index += 1) {
        const line = records[index] ?? '';
        if (line === '' || line.startsWith('#')) {
            continue;
        }
        const kind = line.slice(0, 1);
        const spaces = FIELDS_BEFORE_PATH[kind];
        const path = spaces === undefined ? null : tailAfter(line, spaces);
        if (path === null || path === '') {
            return null;
        }
        paths.push(path);
        if (kind === RENAME) {
            index += 1;
        }
    }
    return paths;
}

export function parseLastCommit(text: string): LastCommit | null {
    const [hash, subject] = text.replace(/\n$/u, '').split('\0');
    return hash === undefined || subject === undefined || !HASH.test(hash) ? null : { hash, subject };
}
