import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';
import { ENGINE_FILES_PATH, engineOf } from './move-map.ts';

interface Edge {
    readonly from: string;
    readonly to: string;
    readonly kind: 'import' | 're-export';
}

interface Specifier {
    readonly spec: string;
    readonly kind: Edge['kind'];
}

const ROOT = new URL('../../', import.meta.url);

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
    'src/adapters/job/decider.ts',
    'src/daemon/autocompact-sweep.ts',
    'src/recap/domain/count.ts',
    'src/recap/domain/probability.ts',
    'src/recap/domain/usd.ts',
    'src/recap/domain/idle-hold.ts',
    'src/recap/application/autocompact-line.ts',
];

const ENGINE: readonly string[] = engineOf(JSON.parse(readFileSync(ENGINE_FILES_PATH, 'utf8')));

const KNOWN: readonly Edge[] = [
    { from: 'src/adapters/job/decider.ts', to: 'src/adapters/job/legacy.ts', kind: 're-export' },
    { from: 'src/adapters/job/decider.ts', to: 'src/ports/harness.ts', kind: 'import' },
    { from: 'src/adapters/job/decider.ts', to: 'src/recap/domain/token-amount.ts', kind: 'import' },
    { from: 'src/daemon/autocompact-sweep.ts', to: 'src/recap/domain/board.ts', kind: 'import' },
    { from: 'src/daemon/autocompact-sweep.ts', to: 'src/recap/domain/lane.ts', kind: 'import' },
    { from: 'src/daemon/autocompact-sweep.ts', to: 'src/recap/domain/status.ts', kind: 'import' },
    { from: 'src/ports/autocompact-records.ts', to: 'src/ports/legacy.ts', kind: 're-export' },
    { from: 'src/ports/autocompact-records.ts', to: 'src/recap/domain/ids.ts', kind: 'import' },
    { from: 'src/ports/autocompact-records.ts', to: 'src/recap/domain/ids.ts', kind: 'import' },
    { from: 'src/ports/decider.ts', to: 'src/ports/legacy.ts', kind: 're-export' },
    { from: 'src/ports/decider.ts', to: 'src/recap/domain/token-amount.ts', kind: 'import' },
    { from: 'src/recap/application/autocompact-gates.ts', to: 'src/ports/compaction-records.ts', kind: 'import' },
    { from: 'src/recap/application/autocompact-gates.ts', to: 'src/ports/requests.ts', kind: 'import' },
    { from: 'src/recap/application/autocompact-gates.ts', to: 'src/recap/application/lane-claims.ts', kind: 'import' },
    { from: 'src/recap/application/autocompact-gates.ts', to: 'src/recap/domain/ids.ts', kind: 'import' },
    { from: 'src/recap/application/autocompact-shapes.ts', to: 'src/recap/domain/lane.ts', kind: 'import' },
    { from: 'src/recap/application/autocompact-shapes.ts', to: 'src/recap/domain/status.ts', kind: 'import' },
    { from: 'src/recap/application/autocompact.ts', to: 'src/ports/boundaries.ts', kind: 'import' },
    { from: 'src/recap/application/autocompact.ts', to: 'src/ports/compaction-records.ts', kind: 'import' },
    { from: 'src/recap/application/autocompact.ts', to: 'src/ports/requests.ts', kind: 'import' },
    { from: 'src/recap/application/autocompact.ts', to: 'src/recap/application/lane-claims.ts', kind: 'import' },
    { from: 'src/recap/application/autocompact.ts', to: 'src/recap/application/lane-events.ts', kind: 'import' },
    { from: 'src/recap/application/autocompact.ts', to: 'src/recap/application/recap-wait.ts', kind: 'import' },
    { from: 'src/recap/application/autocompact.ts', to: 'src/recap/domain/ids.ts', kind: 'import' },
    { from: 'src/recap/application/autocompact.ts', to: 'src/recap/domain/lane.ts', kind: 'import' },
    { from: 'src/recap/application/autocompact.ts', to: 'src/recap/domain/status.ts', kind: 'import' },
    { from: 'src/recap/domain/autocompact-style.ts', to: 'src/recap/domain/legacy.ts', kind: 're-export' },
    { from: 'src/recap/domain/autocompact-style.ts', to: 'src/recap/domain/legacy.ts', kind: 're-export' },
    { from: 'src/recap/domain/autocompact.ts', to: 'src/recap/domain/ids.ts', kind: 'import' },
    { from: 'src/recap/domain/autocompact.ts', to: 'src/recap/domain/legacy.ts', kind: 're-export' },
    { from: 'src/recap/domain/autocompact.ts', to: 'src/recap/domain/legacy.ts', kind: 're-export' },
    { from: 'src/recap/domain/autocompact.ts', to: 'src/recap/domain/legacy.ts', kind: 're-export' },
];

const STUB_CARRIED: readonly Edge[] = [
    { from: 'src/adapters/job/decider.ts', to: 'src/adapters/job/legacy.ts', kind: 're-export' },
    { from: 'src/ports/autocompact-records.ts', to: 'src/ports/legacy.ts', kind: 're-export' },
    { from: 'src/ports/decider.ts', to: 'src/ports/legacy.ts', kind: 're-export' },
    { from: 'src/recap/domain/autocompact-style.ts', to: 'src/recap/domain/legacy.ts', kind: 're-export' },
    { from: 'src/recap/domain/autocompact-style.ts', to: 'src/recap/domain/legacy.ts', kind: 're-export' },
    { from: 'src/recap/domain/autocompact.ts', to: 'src/recap/domain/legacy.ts', kind: 're-export' },
    { from: 'src/recap/domain/autocompact.ts', to: 'src/recap/domain/legacy.ts', kind: 're-export' },
    { from: 'src/recap/domain/autocompact.ts', to: 'src/recap/domain/legacy.ts', kind: 're-export' },
];

const keyOf = (edge: Edge): string => `${edge.from}|${edge.to}|${edge.kind}`;

const byKey = (left: Edge, right: Edge): number => {
    const leftKey = keyOf(left);
    const rightKey = keyOf(right);
    if (leftKey === rightKey) {
        return 0;
    }
    return leftKey < rightKey ? -1 : 1;
};

const specifiersOf = (file: string): readonly Specifier[] => {
    const source = ts.createSourceFile(file, readFileSync(new URL(file, ROOT), 'utf8'), ts.ScriptTarget.Latest, true);
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

const isInside = (target: string): boolean => TIMING.includes(target) || ENGINE.includes(target);

const edgesOf = (file: string): readonly Edge[] =>
    specifiersOf(file).flatMap(({ spec, kind }) => {
        const target = targetOf(file, spec);
        return target === undefined || isInside(target) ? [] : [{ from: file, to: target, kind }];
    });

const isFile = (file: string): boolean => existsSync(new URL(file, ROOT)) && statSync(new URL(file, ROOT)).isFile();

test('the timing files import outside the engine only through the known edges', () => {
    assert.deepEqual(TIMING.flatMap(edgesOf).toSorted(byKey), KNOWN);
});

test('every timing file and every known target exists', () => {
    const files = [...new Set([...TIMING, ...KNOWN.map((edge) => edge.to)])];
    assert.deepEqual(files.filter((file) => !isFile(file)), []);
});

test('a re-export of legacy.ts is the only edge E14 stubs may keep', () => {
    const carried = TIMING.flatMap(edgesOf)
        .filter((edge) => edge.kind === 're-export' && edge.to.endsWith('/legacy.ts'))
        .toSorted(byKey);
    assert.deepEqual(carried, STUB_CARRIED);
    assert.deepEqual(
        STUB_CARRIED.filter((stub) => !KNOWN.some((edge) => keyOf(edge) === keyOf(stub))),
        [],
    );
});

test('no timing file imports a name from a legacy.ts: every edge into one is a re-export', () => {
    const imports = TIMING.flatMap(edgesOf).filter((edge) => edge.kind === 'import' && edge.to.endsWith('/legacy.ts'));
    assert.deepEqual(imports, []);
});
