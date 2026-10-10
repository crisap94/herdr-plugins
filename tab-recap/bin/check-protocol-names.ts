import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAPABILITY_TOKEN } from '#src/protocol/capability.ts';
import { answerToken, failureStage } from '#src/protocol/exchange.ts';
import type { Exchange } from '#src/protocol/exchange.ts';
import { REGISTRY } from '#src/recap/domain/token-registry.ts';

export interface Finding {
    readonly file: string;
    readonly line: number;
    readonly literal: string;
}

const PROTOCOL_DIR = 'src/protocol';
const STRING_LITERAL = /(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g;

const wireNamesOf = (exchange: Exchange): readonly string[] => {
    const answer = answerToken(exchange);
    return [exchange.requestPrefix, ...(answer.kind === 'ok' ? [answer.value] : []), ...exchange.failureReasons.map(failureStage)];
};

export const protocolLiterals = (exchanges: readonly Exchange[]): ReadonlySet<string> =>
    new Set([CAPABILITY_TOKEN, ...exchanges.flatMap(wireNamesOf)]);

const sourceFiles = (root: string): readonly string[] =>
    readdirSync(join(root, 'src'), { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
        .map((entry) => relative(root, join(entry.parentPath, entry.name)))
        .filter((file) => !file.startsWith(`${PROTOCOL_DIR}/`))
        .toSorted();

const literalsIn = (text: string): readonly { readonly literal: string; readonly line: number }[] =>
    [...text.matchAll(STRING_LITERAL)].map((match) => ({ literal: match[2] ?? '', line: text.slice(0, match.index).split('\n').length }));

export function findNames(root: string, literals: ReadonlySet<string>): readonly Finding[] {
    return sourceFiles(root).flatMap((file) =>
        literalsIn(readFileSync(join(root, file), 'utf8'))
            .filter((found) => literals.has(found.literal))
            .map((found) => ({ file, line: found.line, literal: found.literal })));
}

function main(root: string): number {
    const findings = findNames(root, protocolLiterals(REGISTRY.exchanges));
    if (findings.length === 0) {
        console.log('protocol names: clean');
        return 0;
    }
    for (const finding of findings) {
        console.error(`${finding.file}:${finding.line}: ${JSON.stringify(finding.literal)} is a protocol name: read it from src/protocol, do not copy it`);
    }
    console.error(`protocol names: ${findings.length} copied name(s) outside src/protocol`);
    return 1;
}

if (import.meta.main) {
    const [root] = process.argv.slice(2);
    process.exitCode = main(root ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
}
