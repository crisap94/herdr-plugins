import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PLUGIN_ROOT, closureOf } from '#test/support/closure.ts';

const root = PLUGIN_ROOT;
const entry = 'src/recap/application/engine.ts';

const manifest = (): Record<string, readonly string[]> =>
  JSON.parse(readFileSync(new URL('ci/engine-files.json', root), 'utf8'));

test('the files listed as the engine are exactly the import closure of the engine facade', async () => {
  const listed = Object.values(manifest()).flat().toSorted();
  assert.deepEqual(await closureOf(entry), listed);
});

test('each list in the engine manifest is sorted and no file is listed twice', () => {
  const lists = Object.values(manifest());
  for (const list of lists) assert.deepEqual(list, list.toSorted());
  const all = lists.flat();
  assert.equal(new Set(all).size, all.length);
});
