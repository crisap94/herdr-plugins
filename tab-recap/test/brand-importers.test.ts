import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);

test('the files that import brand.ts are exactly the files that declare a brand of it', () => {
  const declaring = readdirSync(new URL('src/', root), { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts'))
    .map((file) => `src/${file}`)
    .filter((file) => {
      const text = readFileSync(new URL(file, root), 'utf8');
      return text.includes('Brand<') && /from '[^']*brand\.ts'/.test(text);
    })
    .toSorted();
  const listed: unknown = JSON.parse(readFileSync(new URL('ci/brand-importers.json', root), 'utf8'));
  assert.deepEqual(declaring, listed);
});
