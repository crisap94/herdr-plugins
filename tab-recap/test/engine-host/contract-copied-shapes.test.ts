import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const repository = new URL('../../../', import.meta.url);
const shapesDir = new URL('packages/session-ledger/gates/copied-shapes/', repository);

const NAME_MAP: Readonly<Record<string, string>> = {
    TabRecap: 'Recap',
    LaneCursor: 'SessionCursor',
    LaneMark: 'SessionMark',
    DecisionVerdict: 'Verdict',
    AutocompactMode: 'WatchMode',
    AutocompactPolicy: 'Policy',
    AutocompactTuning: 'Tuning',
    AutocompactStyle: 'DecisionStyle',
    AutocompactState: 'DeciderState',
    Noul: 'Question',
    NoulCriteria: 'QuestionCriteria',
};

interface Row {
    readonly export: string;
    readonly origin: string;
    readonly originName?: string;
    readonly originConst?: string;
}

interface Copied {
    readonly contract: string;
    readonly row: Row;
}

const isRow = (input: unknown): input is Row => {
    if (typeof input !== 'object' || input === null) {
        return false;
    }
    const fields: Readonly<Record<string, unknown>> = { ...input };
    const optionalText = (key: string): boolean => fields[key] === undefined || typeof fields[key] === 'string';
    return typeof fields['export'] === 'string' && typeof fields['origin'] === 'string' && optionalText('originName') && optionalText('originConst');
};

const contractFileOf = (shapesFile: string): string => {
    const name = shapesFile.replace(/\.json$/, '');
    return name === 'compaction-timing' ? 'packages/session-ledger/src/compaction-timing/contract.ts' : `packages/session-ledger/src/contract/${name}.ts`;
};

const rowsOf = (shapesFile: string): readonly Copied[] => {
    const parsed: unknown = JSON.parse(readFileSync(new URL(shapesFile, shapesDir), 'utf8'));
    assert.ok(Array.isArray(parsed), `${shapesFile} holds a JSON array`);
    return parsed.map((input: unknown) => {
        assert.ok(isRow(input), `${shapesFile}: ${JSON.stringify(input)} is not a row`);
        return { contract: contractFileOf(shapesFile), row: input };
    });
};

const allRows = (): readonly Copied[] =>
    readdirSync(shapesDir).filter((name) => name.endsWith('.json')).toSorted().flatMap((name) => rowsOf(name));

const read = (path: string): string => readFileSync(new URL(path, repository), 'utf8');

const sourceOf = (path: string, text: string): ts.SourceFile => ts.createSourceFile(path, text, ts.ScriptTarget.ES2023, true);

const declarationOf = (source: ts.SourceFile, name: string): ts.InterfaceDeclaration | ts.TypeAliasDeclaration | undefined =>
    source.statements.find((statement): statement is ts.InterfaceDeclaration | ts.TypeAliasDeclaration =>
        (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) && statement.name.text === name);

const renamed = (text: string): string =>
    Object.entries(NAME_MAP).reduce((current, [from, to]) => current.replace(new RegExp(`\\b${from}\\b`, 'g'), to), text);

const normalised = (text: string): string => text.replace(/\s+/g, ' ').replace(/\s*([{}();:,|<>[\]=?])\s*/g, '$1').trim();

const unionMembers = (declaration: ts.InterfaceDeclaration | ts.TypeAliasDeclaration): readonly string[] | undefined => {
    if (!ts.isTypeAliasDeclaration(declaration) || !ts.isUnionTypeNode(declaration.type)) {
        return undefined;
    }
    const members = declaration.type.types.map((member) => (ts.isLiteralTypeNode(member) && ts.isStringLiteral(member.literal) ? member.literal.text : undefined));
    return members.every((member) => member !== undefined) ? members.toSorted() : undefined;
};

const constMembers = (source: ts.SourceFile, name: string): readonly string[] | undefined => {
    const declaration = source.statements
        .filter(ts.isVariableStatement)
        .flatMap((statement) => statement.declarationList.declarations)
        .find((candidate) => ts.isIdentifier(candidate.name) && candidate.name.text === name);
    const initializer = declaration?.initializer;
    const array = initializer !== undefined && ts.isAsExpression(initializer) ? initializer.expression : initializer;
    if (array === undefined || !ts.isArrayLiteralExpression(array)) {
        return undefined;
    }
    const members = array.elements.map((element) => (ts.isStringLiteral(element) ? element.text : undefined));
    return members.every((member) => member !== undefined) ? members.toSorted() : undefined;
};

const differencesOf = (copied: Copied, contractText: string, originText: string): readonly string[] => {
    const { contract, row } = copied;
    const label = `${contract} ${row.export}`;
    const ours = declarationOf(sourceOf(contract, contractText), row.export);
    if (ours === undefined) {
        return [`${label}: no exported interface or type of that name`];
    }
    const origin = sourceOf(row.origin, originText);
    if (row.originConst !== undefined) {
        const expected = constMembers(origin, row.originConst);
        const actual = unionMembers(ours);
        if (expected === undefined || actual === undefined) {
            return [`${label}: ${row.origin} ${row.originConst} or the contract union is not a list of string literals`];
        }
        return JSON.stringify(expected) === JSON.stringify(actual) ? [] : [`${label}: members ${actual.join(' ')} differ from ${row.originConst} ${expected.join(' ')}`];
    }
    const theirs = declarationOf(origin, row.originName ?? row.export);
    if (theirs === undefined) {
        return [`${label}: ${row.origin} declares no ${row.originName ?? row.export}`];
    }
    const want = normalised(renamed(theirs.getText()));
    const have = normalised(ours.getText());
    return want === have ? [] : [`${label}: differs from ${row.origin}\n  main:     ${want}\n  contract: ${have}`];
};

const RECORD_ROW: Copied = { contract: 'packages/session-ledger/src/contract/records.ts', row: { export: 'Recap', origin: 'tab-recap/src/ports/recap-records.ts', originName: 'TabRecap' } };
const SECTION_ROW: Copied = { contract: 'packages/session-ledger/src/contract/facts.ts', row: { export: 'Section', origin: 'tab-recap/src/recap/domain/fact.ts', originConst: 'SECTION_IDS' } };

test('every copied declaration of the contract equals its declaration on main', () => {
    const rows = allRows();
    assert.ok(rows.some(({ row }) => row.export === 'HistoryFact'));
    assert.ok(rows.some(({ row }) => row.export === 'Recap'));
    assert.deepEqual(rows.flatMap((copied) => differencesOf(copied, read(copied.contract), read(copied.row.origin))), []);
});

test('a copied field whose type drifts from main is reported', () => {
    const drifted = read(RECORD_ROW.contract).replace('readonly costUsd: number;', 'readonly costUsd: string;');
    assert.equal(differencesOf(RECORD_ROW, drifted, read(RECORD_ROW.row.origin)).length, 1);
});

test('the name map lets a renamed copy match, and the unmapped name does not', () => {
    const origin = read(RECORD_ROW.row.origin);
    assert.deepEqual(differencesOf(RECORD_ROW, read(RECORD_ROW.contract), origin), []);
    const unmapped = read(RECORD_ROW.contract).replace('readonly lanes: readonly SessionCursor[];', 'readonly lanes: readonly LaneCursor[];');
    assert.equal(differencesOf(RECORD_ROW, unmapped, origin).length, 1);
});

test('a literal union that loses a member of its constant array is reported', () => {
    const shortened = read(SECTION_ROW.contract).replace(" | 'rules';", ';');
    assert.equal(differencesOf(SECTION_ROW, shortened, read(SECTION_ROW.row.origin)).length, 1);
});

test('a row whose origin declares no such name is reported', () => {
    const missing: Copied = { contract: RECORD_ROW.contract, row: { ...RECORD_ROW.row, originName: 'NoSuchRecord' } };
    assert.equal(differencesOf(missing, read(RECORD_ROW.contract), read(RECORD_ROW.row.origin)).length, 1);
});
