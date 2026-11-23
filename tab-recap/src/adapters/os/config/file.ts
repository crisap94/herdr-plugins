import { readFileSync } from 'node:fs';
import { must } from '#src/protocol/result.ts';
import type { Result } from '#src/protocol/result.ts';
import type { EnvironmentName } from '#src/recap/domain/backend.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import { textOf, type Text } from '#src/recap/domain/text.ts';
import type { ParseFailure } from '@stateforge-labs/session-ledger/unstable/recap/domain/parse-failure.ts';
import { writeAtomically } from '../atomic-file.ts';

export function setValues(path: FsPath, values: ReadonlyMap<EnvironmentName, Text>, parse: (text: Text) => Result<ReadonlyMap<EnvironmentName, Text>, ParseFailure>): void {
    let text = '';
    try { text = readFileSync(path, 'utf8'); } catch { }
    const lines = text === '' ? [] : text.replace(/\n$/, '').split('\n');
    for (const [key, value] of values) {
        const at = lines.findIndex((line) => must(parse(textOf(line))).has(key));
        const entry = `${key}=${value}`;
        if (at >= 0) {
            lines[at] = entry;
        } else {
            lines.push(entry);
        }
    }
    writeAtomically(path, textOf(`${lines.join('\n')}\n`));
}
