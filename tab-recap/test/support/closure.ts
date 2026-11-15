import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { cruise } from 'dependency-cruiser';

export const PLUGIN_ROOT = new URL('../../', import.meta.url);

export const closureOf = async (start: string): Promise<readonly string[]> => {
  const result = await cruise([start], {
    baseDir: fileURLToPath(PLUGIN_ROOT),
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
