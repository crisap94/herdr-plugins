import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import type { TestContext } from 'node:test';

const dtdPath = (name: string): string => new URL(`../schema/${name}`, import.meta.url).pathname;
const installed = spawnSync('xmllint', ['--version'], { encoding: 'utf8' }).status === 0;

export interface Verdict {
    readonly valid: boolean;
    readonly output: string;
}

export function validate(document: string, dtd = 'recap-input.dtd'): Verdict {
    const ran = spawnSync('xmllint', ['--noout', '--dtdvalid', dtdPath(dtd), '-'], { input: document, encoding: 'utf8' });
    return { valid: ran.status === 0, output: `${ran.stdout}${ran.stderr}` };
}

export function dtdTest(name: string, body: (t: TestContext) => void): void {
    test(name, (t) => {
        if (!installed) {
            assert.ok(process.env['CI'] === undefined || process.env['CI'] === '', 'xmllint is not installed but CI is set: install libxml2-utils');
            t.skip('xmllint is not installed (libxml2-utils)');
            return;
        }
        body(t);
    });
}
