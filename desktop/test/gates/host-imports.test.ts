import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { checkHostImports, declaredHostNames, hostTypeProblems, importedHostNames, settingsOf, specifierProblems, type HostSettings } from '../../gates/check-host-imports.ts';

const settings: HostSettings = { domain: 'mods', hostTypes: 'types/host.d.ts', hostModules: ['herdr', 'gpui-kit', 'gpui-base'] };
const root = join(dirname(new URL(import.meta.url).pathname), '..', '..');

test('a relative import inside the mod and an import of a host module pass', () => {
    const text = 'import { exec } from "herdr";\nimport { div } from "gpui-kit";\nimport { MOD } from "../constants.js";\nimport { tint } from "./theme.js";\n';
    assert.deepEqual(specifierProblems({ path: 'mods/tab-recap/roles/seed.js', text }, settings), []);
});

test('a bare import that is not a host module is a finding, whether static, dynamic or required', () => {
    const text = 'import { readFileSync } from "node:fs";\nconst lazy = import("lodash");\nconst old = require("left-pad");\n';
    assert.deepEqual(specifierProblems({ path: 'mods/tab-recap/seed.js', text }, settings), [
        'mods/tab-recap/seed.js: node:fs is neither relative nor a host module (gates/config.json hostModules)',
        'mods/tab-recap/seed.js: lodash is neither relative nor a host module (gates/config.json hostModules)',
        'mods/tab-recap/seed.js: left-pad is neither relative nor a host module (gates/config.json hostModules)',
    ]);
});

test('a relative import that leaves the folder of its mod is a finding', () => {
    assert.deepEqual(specifierProblems({ path: 'mods/tab-recap/seed.js', text: 'import { x } from "../other/x.js";\n' }, settings), ['mods/tab-recap/seed.js: ../other/x.js leaves the folder of its mod']);
});

test('a host name a mod imports and the types do not declare, and one declared and never imported, are findings', () => {
    const imported = importedHostNames([{ path: 'mods/tab-recap/seed.js', text: 'import { exec, home } from "herdr";\nimport { MOD } from "./constants.js";\n' }], settings);
    const declared = declaredHostNames('declare module "herdr" {\n  export const exec: unknown;\n  export const panes: unknown;\n}\n');
    assert.deepEqual(hostTypeProblems(imported, declared, 'types/host.d.ts'), [
        'types/host.d.ts: herdr:home is imported by a mod and not declared',
        'types/host.d.ts: herdr:panes is declared and no mod imports it',
    ]);
});

test('the mods import only host modules and their own files, and types/host.d.ts declares exactly the host names they import', () => {
    assert.deepEqual(checkHostImports(root, settingsOf(root)), []);
});
