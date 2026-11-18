import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const ROOT = join(dirname(new URL(import.meta.url).pathname), '..');
const WORDS = /\b(pane|tab|workspace|herdr|lane)\b/gi;

const baselineOf = (): ReadonlyMap<string, number> => {
    const parsed: unknown = JSON.parse(readFileSync(join(ROOT, 'gates/vocabulary-baseline.json'), 'utf8'));
    assert.ok(typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed), 'gates/vocabulary-baseline.json must be an object of file to count');
    return new Map(Object.entries(parsed).map(([file, count]): [string, number] => [file, typeof count === 'number' ? count : 0]));
};

const countsOf = (): ReadonlyMap<string, number> =>
    new Map(readdirSync(join(ROOT, 'src'), { recursive: true, encoding: 'utf8' })
        .filter((name) => name.endsWith('.ts'))
        .map((name): [string, number] => [`src/${name}`, readFileSync(join(ROOT, 'src', name), 'utf8').match(WORDS)?.length ?? 0]));

test('no source file of the package uses the host vocabulary more than its baseline row', () => {
    const baseline = baselineOf();
    const risen = [...countsOf()]
        .filter(([file, count]) => count > (baseline.get(file) ?? 0))
        .map(([file, count]) => `${file}: ${count} > ${baseline.get(file) ?? 0}`);
    assert.deepEqual(risen, []);
});
