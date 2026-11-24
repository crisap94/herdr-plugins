import { readFileSync } from 'node:fs';
import { must } from '@stateforge-labs/session-ledger';
import type { Result } from '@stateforge-labs/session-ledger';
import type { EnvironmentName } from '@stateforge-labs/session-ledger';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import { textOf, type Text } from '@stateforge-labs/session-ledger';
import type { ParseFailure } from '@stateforge-labs/session-ledger';
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
