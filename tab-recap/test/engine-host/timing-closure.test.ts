import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';

interface Edge {
    readonly from: string;
    readonly to: string;
    readonly kind: 'import' | 're-export';
}

interface Specifier {
    readonly spec: string;
    readonly kind: Edge['kind'];
}

const PACKAGE_ROOT = new URL('../../../packages/session-ledger/', import.meta.url);

const TIMING: readonly string[] = [
    'src/recap/application/autocompact.ts',
    'src/recap/application/autocompact-gates.ts',
    'src/recap/application/autocompact-shapes.ts',
    'src/recap/application/autocompact-state.ts',
    'src/recap/application/autocompact-questions.ts',
    'src/recap/domain/autocompact.ts',
    'src/recap/domain/autocompact-style.ts',
    'src/recap/domain/autocompact-verdict.ts',
    'src/recap/domain/continuation-note.ts',
    'src/ports/decider.ts',
    'src/ports/autocompact-records.ts',
    'src/daemon/autocompact-sweep.ts',
    'src/recap/domain/count.ts',
    'src/recap/domain/probability.ts',
    'src/recap/domain/usd.ts',
    'src/recap/domain/idle-hold.ts',
    'src/recap/domain/timing-ids.ts',
    'src/recap/domain/token-amount.ts',
    'src/recap/application/autocompact-line.ts',
];

const ALLOWED_PREFIXES: readonly string[] = ['src/compaction-timing/', 'src/protocol/', 'src/contract/', 'src/ports/', 'src/recap/domain/'];

const specifiersOf = (file: string, root: URL = PACKAGE_ROOT): readonly Specifier[] => {
    const source = ts.createSourceFile(file, readFileSync(new URL(file, root), 'utf8'), ts.ScriptTarget.Latest, true);
    const found: Specifier[] = [];
    const visit = (node: ts.Node): void => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
            found.push({ spec: node.moduleSpecifier.text, kind: 'import' });
        } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)) {
            found.push({ spec: node.moduleSpecifier.text, kind: 're-export' });
        } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            const [first] = node.arguments;
            if (first !== undefined && ts.isStringLiteral(first)) {
                found.push({ spec: first.text, kind: 'import' });
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return found;
};

const targetOf = (file: string, spec: string): string | undefined => {
    if (spec.startsWith('#src/')) {
        return `src/${spec.slice('#src/'.length)}`;
    }
    if (spec.startsWith('./') || spec.startsWith('../')) {
        return path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
    }
    return undefined;
};

const isInside = (target: string): boolean => TIMING.includes(target);

const packageEdgesOf = (file: string): readonly Edge[] =>
    specifiersOf(file).flatMap(({ spec, kind }) => {
        const target = targetOf(file, spec);
        return target === undefined ? [] : [{ from: file, to: target, kind }];
    });

const isFile = (root: URL, file: string): boolean => existsSync(new URL(file, root)) && statSync(new URL(file, root)).isFile();

test('every timing file exists in the package', () => {
    assert.deepEqual(TIMING.filter((file) => !isFile(PACKAGE_ROOT, file)), []);
});

test('a timing file in the package imports only its own set, the kernel, contract, protocol, port and domain files', () => {
    const outside = TIMING.flatMap(packageEdgesOf).filter((edge) => !isInside(edge.to) && !ALLOWED_PREFIXES.some((prefix) => edge.to.startsWith(prefix)));
    assert.deepEqual(outside, []);
    const application = TIMING.flatMap(packageEdgesOf).filter((edge) => edge.to.startsWith('src/recap/application/') && !isInside(edge.to));
    assert.deepEqual(application, []);
});

test('no timing file in the package imports or re-exports a legacy.ts or reaches into tab-recap', () => {
    const legacy = TIMING.flatMap(packageEdgesOf).filter((edge) => edge.to.endsWith('/legacy.ts') || edge.to.includes('tab-recap'));
    assert.deepEqual(legacy, []);
    const sources = TIMING.map((file) => readFileSync(new URL(file, PACKAGE_ROOT), 'utf8'));
    assert.deepEqual(sources.filter((source) => source.includes('tab-recap/') || source.includes('legacy.ts')), []);
});
