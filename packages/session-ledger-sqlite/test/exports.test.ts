import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const root = join(dirname(new URL(import.meta.url).pathname), '..');

function exportsMap(): Readonly<Record<string, string>> {
    const manifest: unknown = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    assert.ok(typeof manifest === 'object' && manifest !== null && 'exports' in manifest);
    const map: unknown = manifest.exports;
    assert.ok(typeof map === 'object' && map !== null);
    return Object.fromEntries(Object.entries(map).map(([key, target]) => [key, String(target)]));
}

test('every exports target of package.json exists in the package', () => {
    const missing = Object.values(exportsMap())
        .map((target) => (target.endsWith('/*') ? target.slice(0, -2) : target))
        .filter((target) => !existsSync(join(root, target)));
    assert.deepEqual(missing, []);
});

test('the package root resolves through its own exports map', async () => {
    const manifest: unknown = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    assert.ok(typeof manifest === 'object' && manifest !== null && 'name' in manifest);
    const module: unknown = await import(String(manifest.name));
    assert.equal(typeof module, 'object');
});
