import assert from 'node:assert/strict';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';
import * as timing from '@stateforge-labs/session-ledger/compaction-timing';

const packageRoot = join(dirname(new URL(import.meta.url).pathname), '..', '..');
const importer = join(packageRoot, 'test', 'e2e', 'compaction-port.test.ts');
const PORT = '@stateforge-labs/session-ledger/unstable/compaction-timing/engine-port.ts';
const ENTRY = '@stateforge-labs/session-ledger/compaction-timing';

const NINETEEN = [
    'AccomplishmentEstablished',
    'Awaiting',
    'BackgroundItem',
    'Brand',
    'ContextUse',
    'Duration',
    'Entry',
    'Fact',
    'Flight',
    'HarnessKind',
    'HistoryFact',
    'Instant',
    'Observed',
    'ScopeId',
    'Section',
    'SessionKey',
    'Text',
    'Unknown',
    'WindowSource',
];

const CLOSURE = ['Awaiting', 'BackgroundItem', 'ContextUse', 'WindowSource'];

const DECLARED = [
    'AutocompactKinds',
    'Backoff',
    'Candidate',
    'CeilingPolicy',
    'CheckedFact',
    'CompactionActivity',
    'CompactionAsk',
    'Consideration',
    'ContinuationNote',
    'CoverageAmendment',
    'CoverageOutcome',
    'Decided',
    'Decider',
    'DeciderState',
    'Decision',
    'DecisionGate',
    'DecisionLog',
    'DecisionMode',
    'DecisionStyle',
    'Effect',
    'GateInput',
    'LaneKind',
    'LaneStatusAtDecision',
    'LastDecision',
    'LinkedDecision',
    'Milliseconds',
    'MissedFacts',
    'NoteLimit',
    'OpenWorkItem',
    'Policy',
    'PolicySettings',
    'Question',
    'QuestionCriteria',
    'RecapReadiness',
    'RegisteredKind',
    'SafePointEvent',
    'SafePointPorts',
    'SafePointWatch',
    'SessionSignals',
    'Skip',
    'SkipGate',
    'Sweep',
    'Thresholds',
    'Tuning',
    'Turn',
    'UncheckedReason',
    'Verdict',
    'WatchMode',
];

interface Exported {
    readonly name: string;
    readonly declaredIn: readonly string[];
}

function compilerOptions(): ts.CompilerOptions {
    const config = ts.readConfigFile(join(packageRoot, 'tsconfig.json'), (path) => ts.sys.readFile(path));
    assert.equal(config.error, undefined);
    return ts.parseJsonConfigFileContent(config.config, ts.sys, packageRoot).options;
}

function exportsOf(specifier: string, replaced: string | null = null): readonly Exported[] {
    const options = compilerOptions();
    const resolved = ts.resolveModuleName(specifier, importer, options, ts.sys).resolvedModule;
    assert.ok(resolved !== undefined, `${specifier} resolves through the exports map`);
    const file = resolved.resolvedFileName;
    const host = ts.createCompilerHost(options);
    const readFile = host.readFile.bind(host);
    host.readFile = (path): string | undefined => (replaced !== null && path === file ? replaced : readFile(path));
    const program = ts.createProgram({ rootNames: [file], options, host });
    const checker = program.getTypeChecker();
    const source = program.getSourceFile(file);
    assert.ok(source !== undefined, `${file} is in the program`);
    const module = checker.getSymbolAtLocation(source);
    assert.ok(module !== undefined, `${file} is a module`);
    return checker.getExportsOfModule(module)
        .map((symbol) => {
            const target = (symbol.flags & ts.SymbolFlags.Alias) === 0 ? symbol : checker.getAliasedSymbol(symbol);
            return { name: symbol.name, declaredIn: (target.declarations ?? []).map((declaration) => relative(packageRoot, declaration.getSourceFile().fileName)) };
        })
        .toSorted((left, right) => (left.name < right.name ? -1 : 1));
}

test('engine-port re-exports exactly the nineteen names of EC 2.2', () => {
    assert.deepEqual(exportsOf(PORT).map(({ name }) => name), NINETEEN);
});

test('every name of engine-port is declared once, in src/contract, never in compaction-timing', () => {
    const outside = exportsOf(PORT).filter(({ declaredIn }) => declaredIn.length !== 1 || !declaredIn[0]?.startsWith('src/contract/'));
    assert.deepEqual(outside, []);
});

test('a port that declares a name of its own instead of re-exporting it is reported', () => {
    const resolved = ts.resolveModuleName(PORT, importer, compilerOptions(), ts.sys).resolvedModule;
    assert.ok(resolved !== undefined);
    const text = `${ts.sys.readFile(resolved.resolvedFileName) ?? ''}export type Extra = string;\n`;
    const seeded = exportsOf(PORT, text);
    assert.equal(seeded.length, 20);
    assert.deepEqual(seeded.filter(({ declaredIn }) => !declaredIn[0]?.startsWith('src/contract/')).map(({ name }) => name), ['Extra']);
});

test('the compaction-timing entry exports no value', () => {
    assert.deepEqual(Object.keys(timing), []);
});

test('the compaction-timing entry re-exports the four closure names of engine-port and declares the rest in contract.ts', () => {
    const exported = exportsOf(ENTRY);
    assert.deepEqual(exported.map(({ name }) => name), [...CLOSURE, ...DECLARED].toSorted());
    assert.deepEqual(exported.filter(({ name }) => CLOSURE.includes(name)).map(({ declaredIn }) => declaredIn), CLOSURE.map(() => ['src/contract/session.ts']));
    assert.deepEqual(exported.filter(({ name, declaredIn }) => !CLOSURE.includes(name) && declaredIn.join() !== 'src/compaction-timing/contract.ts').map(({ name }) => name), []);
});
