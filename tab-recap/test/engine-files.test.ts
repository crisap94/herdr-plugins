import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { cruise } from 'dependency-cruiser';

const root = new URL('../', import.meta.url);
const entry = 'src/recap/application/recap-job.ts';

const closureOf = async (start: string): Promise<readonly string[]> => {
  const result = await cruise([start], {
    baseDir: fileURLToPath(root),
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'types', 'default'] },
  });
  assert.equal(typeof result.output, 'object');
  if (typeof result.output === 'string') return [];
  return result.output.modules
    .filter((module) => module.coreModule !== true)
    .map((module) => module.source)
    .toSorted();
};

const manifest = (): Record<string, readonly string[]> =>
  JSON.parse(readFileSync(new URL('ci/engine-files.json', root), 'utf8'));

test('the files listed as the engine are exactly the import closure of the recap job', async () => {
  const listed = Object.values(manifest()).flat().toSorted();
  assert.deepEqual(await closureOf(entry), listed);
});

test('each list in the engine manifest is sorted and no file is listed twice', () => {
  const lists = Object.values(manifest());
  for (const list of lists) assert.deepEqual(list, list.toSorted());
  const all = lists.flat();
  assert.equal(new Set(all).size, all.length);
});
