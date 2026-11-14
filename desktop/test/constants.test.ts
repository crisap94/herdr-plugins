import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';
import * as contract from 'herdr-desktop-mods/tab-recap/contract';
import * as constants from '../mods/tab-recap/constants.js';
import type * as Declared from '../types/tab-recap-constants.d.ts';

const root = join(dirname(new URL(import.meta.url).pathname), '..');

const declaredNames = (): readonly string[] => {
    const path = join(root, 'types', 'tab-recap-constants.d.ts');
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    return source.statements.filter(ts.isVariableStatement).flatMap((statement) => statement.declarationList.declarations.map((variable) => variable.name.getText(source)));
};

test('types/tab-recap-constants.d.ts declares every export of constants.js and nothing else', () => {
    assert.deepEqual(declaredNames().toSorted(), Object.keys(constants).toSorted());
});

test('the values of constants.js satisfy the declared types', () => {
    const typed: typeof Declared = constants;
    assert.equal(typed, constants);
});

test('the package export herdr-desktop-mods/tab-recap/contract is constants.js', () => {
    assert.equal(contract, constants);
});
