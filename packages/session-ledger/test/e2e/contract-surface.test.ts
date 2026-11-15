import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';
import * as root from '@stateforge-labs/session-ledger';

const packageRoot = join(dirname(new URL(import.meta.url).pathname), '..', '..');
const surfaceDir = join(packageRoot, 'test', 'e2e', 'surface');

const ELEVEN = [
    'UNREAD',
    'err',
    'instant',
    'isUnknown',
    'ok',
    'parseDirectory',
    'parseHarnessKind',
    'parseScopeId',
    'parseSessionId',
    'parseSessionKey',
    'unknown',
];

function compilerOptions(): ts.CompilerOptions {
    const configPath = join(packageRoot, 'tsconfig.json');
    const config = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
    assert.equal(config.error, undefined);
    return ts.parseJsonConfigFileContent(config.config, ts.sys, packageRoot).options;
}

function fixtures(): readonly string[] {
    return readdirSync(surfaceDir).filter((name) => name.endsWith('.types.ts')).toSorted().map((name) => join(surfaceDir, name));
}

function errorsOf(rootNames: readonly string[], seeded: ReadonlyMap<string, string> = new Map()): readonly string[] {
    const options = compilerOptions();
    const host = ts.createCompilerHost(options);
    const readFile = host.readFile.bind(host);
    host.readFile = (path): string | undefined => seeded.get(path) ?? readFile(path);
    const fileExists = host.fileExists.bind(host);
    host.fileExists = (path): boolean => seeded.has(path) || fileExists(path);
    const program = ts.createProgram({ rootNames, options, host });
    return ts.getPreEmitDiagnostics(program).map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
}

test('the root exports exactly the eleven values', () => {
    assert.deepEqual(Object.keys(root).toSorted(), ELEVEN);
});

test('every surface fixture compiles', () => {
    const names = fixtures();
    assert.ok(names.some((name) => name.endsWith('fnd-2a.types.ts')));
    assert.deepEqual(errorsOf(names), []);
});

test('a fixture that names a missing type does not compile', () => {
    const seeded = join(surfaceDir, 'seeded-missing.types.ts');
    const source = "import type { NotAContractName } from '@stateforge-labs/session-ledger';\nexport type Probe = NotAContractName;\n";
    const errors = errorsOf([seeded], new Map([[seeded, source]]));
    assert.ok(errors.some((message) => message.includes('NotAContractName')));
});

test('a fixture that breaks a type assertion does not compile', () => {
    const seeded = join(surfaceDir, 'seeded-false.types.ts');
    const source = "import type { Engine, SessionKey } from '@stateforge-labs/session-ledger';\ntype Holds<T extends true> = T;\nexport type Probe = Holds<Parameters<Engine['turnEnded']>[1] extends SessionKey ? true : false>;\n";
    const errors = errorsOf([seeded], new Map([[seeded, source]]));
    assert.ok(errors.length > 0);
});

test('the five parsers refuse a non-string and a blank string and brand any other string', () => {
    const parsers = [root.parseScopeId, root.parseSessionKey, root.parseHarnessKind, root.parseSessionId, root.parseDirectory];
    for (const parse of parsers) {
        assert.deepEqual(parse(42), { kind: 'err', error: { kind: 'not-a-string' } });
        assert.deepEqual(parse(null), { kind: 'err', error: { kind: 'not-a-string' } });
        assert.deepEqual(parse(''), { kind: 'err', error: { kind: 'empty' } });
        assert.deepEqual(parse(' \t\n'), { kind: 'err', error: { kind: 'empty' } });
        assert.deepEqual(parse(' a '), { kind: 'ok', value: ' a ' });
    }
});

test('ok, err, instant, unknown, isUnknown and UNREAD keep the shapes of main', () => {
    assert.deepEqual(root.ok(1), { kind: 'ok', value: 1 });
    assert.deepEqual(root.err('x'), { kind: 'err', error: 'x' });
    assert.equal(root.instant(1234), 1234);
    const failed = root.unknown({ why: 'not-found', what: 'transcript' });
    assert.deepEqual(failed, { kind: 'unknown', why: { why: 'not-found', what: 'transcript' } });
    assert.equal(root.isUnknown(failed), true);
    assert.equal(root.isUnknown(root.ok(1)), false);
    assert.deepEqual(root.UNREAD, { cursor: 0, tail: null });
});
