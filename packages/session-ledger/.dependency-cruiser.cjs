const manifest = require('./package.json');

const exact = (path) => `^${path.replace(/^\.\//, '').replace(/[.]/g, '\\.')}$`;
const entries = Object.values(manifest.exports).filter((target) => !target.includes('*')).map(exact);

const timing = [
  'src/recap/application/autocompact.ts',
  'src/recap/application/autocompact-gates.ts',
  'src/recap/application/autocompact-shapes.ts',
  'src/recap/application/autocompact-state.ts',
  'src/recap/application/autocompact-questions.ts',
  'src/recap/application/autocompact-line.ts',
  'src/recap/domain/autocompact.ts',
  'src/recap/domain/autocompact-style.ts',
  'src/recap/domain/autocompact-verdict.ts',
  'src/recap/domain/continuation-note.ts',
  'src/recap/domain/count.ts',
  'src/recap/domain/probability.ts',
  'src/recap/domain/usd.ts',
  'src/recap/domain/idle-hold.ts',
  'src/recap/domain/timing-ids.ts',
  'src/recap/domain/token-amount.ts',
  'src/ports/decider.ts',
  'src/ports/autocompact-records.ts',
  'src/daemon/autocompact-sweep.ts',
].map(exact);

module.exports = {
  options: {
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'types', 'default'] },
  },
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true, viaOnly: { pathNot: '(^|/)legacy\\.ts$' } },
    },
    {
      name: 'no-circular-legacy',
      severity: 'error',
      from: { path: '^(src/.+/)[^/]+\\.ts$' },
      to: { circular: true, via: { pathNot: '^$1[^/]+\\.ts$' } },
    },
    {
      name: 'no-orphans',
      severity: 'error',
      from: { orphan: true, pathNot: ['\\.d\\.ts$', ...entries] },
      to: {},
    },
    {
      name: 'compaction-timing-narrow',
      severity: 'error',
      from: { path: timing },
      to: {
        pathNot: [...timing, '^src/(compaction-timing|protocol|contract)/', '^src/ports/(?!legacy\\.ts$)', '^src/recap/domain/(?!legacy\\.ts$)'],
      },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
};
