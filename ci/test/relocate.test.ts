import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const SCRIPT = join(import.meta.dir, '..', 'codemod', 'relocate.ts');

const MAIN_TREE: Readonly<Record<string, string>> = {
    'README.md': 'OldName stays in prose.\n',
    'tab-recap/package.json': '{\n  "name": "tab-recap",\n  "imports": {\n    "#src/*": "./src/*",\n    "#src/recap/*": "./src/recap/*"\n  }\n}\n',
    'tab-recap/tsconfig.json': '{\n  "compilerOptions": {\n    "paths": {\n      "#src/recap/*": ["./src/recap/*"]\n    }\n  }\n}\n',
    'tab-recap/src/legacy.ts': 'export const legacy = 0;\n',
    'tab-recap/src/other.ts': 'export const other = 2;\n',
    'tab-recap/src/recap/fact.ts': 'export type OldName = number;\nexport const fact: OldName = 1;\n',
    'tab-recap/src/recap/use.ts': "import { fact } from './fact.ts';\nimport { other } from '../other.ts';\nexport const use = fact + other;\n",
    'tab-recap/src/app.ts': "import type { OldName } from '#src/recap/fact.ts';\nimport { use } from './recap/use.ts';\nexport const app: OldName = use;\n",
};

const BRANCH_ONLY: Readonly<Record<string, string>> = {
    'tab-recap/src/parked.ts': "export * from './recap/fact';\nexport const later = await import('#src/recap/use.ts');\n",
    'tab-recap/tools/load.cjs': "module.exports = require('../src/recap/fact.ts');\n",
};

const MAP = [
    'text\tOldName\tNewName\t*.ts',
    'specifier\t#src/recap/\t@lab/ledger/recap/',
    'path\ttab-recap/src/recap\tpackages/ledger/src/recap',
    'drop\ttab-recap/src/legacy.ts',
    '',
].join('\n');

const EXPECTED_TREE: Readonly<Record<string, string>> = {
    'README.md': 'OldName stays in prose.\n',
    'packages/ledger/src/recap/fact.ts': 'export type NewName = number;\nexport const fact: NewName = 1;\n',
    'packages/ledger/src/recap/use.ts': "import { fact } from './fact.ts';\nimport { other } from '../../../../tab-recap/src/other.ts';\nexport const use = fact + other;\n",
    'tab-recap/package.json': '{\n  "name": "tab-recap",\n  "imports": {\n    "#src/*": "./src/*",\n    "@lab/ledger/recap/*": "./src/recap/*"\n  }\n}\n',
    'tab-recap/src/app.ts': "import type { NewName } from '@lab/ledger/recap/fact.ts';\nimport { use } from '../../packages/ledger/src/recap/use.ts';\nexport const app: NewName = use;\n",
    'tab-recap/src/other.ts': 'export const other = 2;\n',
    'tab-recap/src/parked.ts': "export * from '../../packages/ledger/src/recap/fact';\nexport const later = await import('@lab/ledger/recap/use.ts');\n",
    'tab-recap/tools/load.cjs': "module.exports = require('../../packages/ledger/src/recap/fact.ts');\n",
    'tab-recap/tsconfig.json': '{\n  "compilerOptions": {\n    "paths": {\n      "@lab/ledger/recap/*": ["./src/recap/*"]\n    }\n  }\n}\n',
};

const PENDING_REPORT = [
    'drop tab-recap/src/legacy.ts: 1',
    'path tab-recap/src/recap packages/ledger/src/recap: 2',
    'specifier #src/recap/ @lab/ledger/recap/: 4',
    'text OldName NewName *.ts: 2',
    'relative: 4',
    '13 pending',
    '',
].join('\n');

let scratch = '';
let repo = '';
let mapFile = '';

function git(...args: readonly string[]): string {
    const result = spawnSync('git', ['-c', 'user.name=relocate', '-c', 'user.email=relocate@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: repo, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout;
}

function plant(files: Readonly<Record<string, string>>): void {
    for (const [path, content] of Object.entries(files)) {
        mkdirSync(dirname(join(repo, path)), { recursive: true });
        writeFileSync(join(repo, path), content);
    }
}

function relocate(...args: readonly string[]): { readonly status: number | null; readonly stdout: string; readonly stderr: string } {
    const result = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: repo, encoding: 'utf8' });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function tree(): Record<string, string> {
    const files = git('ls-files').split('\n').filter((file) => file !== '').sort();
    return Object.fromEntries(files.map((file) => [file, readFileSync(join(repo, file), 'utf8')]));
}

beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'relocate-'));
    repo = join(scratch, 'repo');
    mkdirSync(repo);
    mapFile = join(scratch, 'example.tsv');
    writeFileSync(mapFile, MAP);
    git('init', '-q', '-b', 'main');
    plant(MAIN_TREE);
    git('add', '-A');
    git('commit', '-q', '-m', 'main-like tree');
    git('checkout', '-q', '-b', 'parked');
    plant(BRANCH_ONLY);
    git('add', '-A');
    git('commit', '-q', '-m', 'branch-only importers');
});

afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
});

describe('relocate codemod', () => {
    test('--check on the unmoved tree prints the pending count per row and exits 1', () => {
        const result = relocate(mapFile, '--check');
        expect(result.stdout).toBe(PENDING_REPORT);
        expect(result.status).toBe(1);
        expect(git('status', '--porcelain')).toBe('');
    });

    test('a run without a flag prints the same report, changes nothing and exits 0', () => {
        const result = relocate(mapFile);
        expect(result.stdout).toBe(PENDING_REPORT);
        expect(result.status).toBe(0);
        expect(git('status', '--porcelain')).toBe('');
    });

    test('--write moves main and fixes the branch-only importers into the expected tree', () => {
        const result = relocate(mapFile, '--write');
        expect(result.status).toBe(0);
        expect(result.stdout.endsWith('13 written\n')).toBe(true);
        expect(tree()).toEqual(EXPECTED_TREE);
        expect(git('status', '--porcelain', '--untracked-files=all').split('\n').filter((line) => line.startsWith('??'))).toEqual([]);
    });

    test('a second --write changes nothing', () => {
        git('commit', '-q', '-m', 'applied');
        const result = relocate(mapFile, '--write');
        expect(result.status).toBe(0);
        expect(result.stdout.endsWith('0 written\n')).toBe(true);
        expect(git('status', '--porcelain')).toBe('');
        expect(tree()).toEqual(EXPECTED_TREE);
    });

    test('--check after the write prints 0 pending and exits 0', () => {
        const result = relocate(mapFile, '--check');
        expect(result.stdout.endsWith('0 pending\n')).toBe(true);
        expect(result.status).toBe(0);
    });

    test('a malformed map, a looping row or a bad flag exits 3 and changes nothing', () => {
        const bad = join(scratch, 'bad.tsv');
        for (const map of ['move\ta\tb\n', 'path\tonly-one-field\n', 'specifier\t#src/\t#src/inner/\n', 'text\tName\tNameToo\n']) {
            writeFileSync(bad, map);
            const result = relocate(bad, '--write');
            expect(result.status).toBe(3);
            expect(result.stderr).toContain('relocate: 3 — NOT COVERED');
        }
        expect(relocate(mapFile, '--force').status).toBe(3);
        expect(git('status', '--porcelain')).toBe('');
    });

    test('a move onto a file that already exists exits 3 and changes nothing', () => {
        const clash = join(scratch, 'clash.tsv');
        writeFileSync(clash, 'path\ttab-recap/src/other.ts\tREADME.md\n');
        const result = relocate(clash, '--write');
        expect(result.status).toBe(3);
        expect(result.stderr).toContain('README.md already exists');
        expect(git('status', '--porcelain')).toBe('');
    });
});
