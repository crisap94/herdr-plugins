import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { codeVersion, parseVersion } from '#src/adapters/os/plugin-version.ts';
import { readDiskVersion } from '#src/pane/version.ts';

const ROOT = join(import.meta.dirname, '..', '..');

const urlOf = (directory: string): URL => pathToFileURL(`${directory}/`);

const MANIFESTS: readonly string[] = [
    'id = "tab-recap"\nversion = "3.0.2"\nmin_herdr_version = "0.9.0"\n',
    'min_herdr_version = "0.9.0"\nversion = "10.20.30"\n',
    'version="1.2.3"\n',
    'version = "3.0"\n',
    'version = "v3.0.2"\n',
    'id = "tab-recap"\n',
    '',
];

const withManifest = (text: string | null, run: (root: string) => void): void => {
    const root = mkdtempSync(join(tmpdir(), 'pane-version-'));
    try {
        if (text !== null) {
            writeFileSync(join(root, 'herdr-plugin.toml'), text);
        }
        run(root);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
};

test('readDiskVersion reads the same version as codeVersion from the real manifest', () => {
    const version = readDiskVersion(urlOf(ROOT)).diskVersion;
    assert.notEqual(version, null);
    assert.equal(version, codeVersion(ROOT));
});

test('readDiskVersion agrees with parseVersion on every manifest of the table', () => {
    for (const text of MANIFESTS) {
        withManifest(text, (root) => {
            assert.equal(readDiskVersion(urlOf(root)).diskVersion, parseVersion(text), JSON.stringify(text));
        });
    }
});

test('readDiskVersion is null when the plugin root has no manifest', () => {
    withManifest(null, (root) => {
        assert.deepEqual(readDiskVersion(urlOf(root)), { diskVersion: null });
    });
});
