const { readdirSync } = require('node:fs');
const { join } = require('node:path');

const ledger = '^\\.\\./packages/session-ledger/src/';
const graphRules = join(__dirname, 'rules', 'graph');
const fragments = readdirSync(graphRules).filter((name) => name.endsWith('.cjs')).toSorted().flatMap((name) => require(join(graphRules, name)));

module.exports = {
  options: {
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'types', 'default'] },
  },
  forbidden: [
    {
      name: 'domain-pure',
      severity: 'error',
      from: { path: '^src/recap/domain/(?!gates/)' },
      to: { pathNot: ['^src/recap/domain/', '^src/protocol/', ledger] },
    },
    {
      name: 'domain-gates-pure',
      severity: 'error',
      from: { path: '^src/recap/domain/gates/' },
      to: { pathNot: ['^src/recap/domain/gates/', '^src/recap/domain/[^/]+\\.ts$', ledger] },
    },
    {
      name: 'layers-no-io-core',
      severity: 'error',
      from: { path: '^src/(recap/(application|render)|i18n)/' },
      to: { dependencyTypes: ['core'], pathNot: '^(node:)?util$' },
    },
    {
      name: 'layers-no-io-adapters',
      severity: 'error',
      from: { path: '^src/(recap/(application|render)|i18n)/' },
      to: { path: '^src/(adapters|transport|daemon|column|setup)/' },
    },
    {
      name: 'protocol-self-contained',
      severity: 'error',
      from: { path: '^src/protocol/(?!exchanges/)' },
      to: { pathNot: ['^src/protocol/', ledger] },
    },
    {
      name: 'protocol-exchanges-self-contained',
      severity: 'error',
      from: { path: '^src/protocol/exchanges/' },
      to: { pathNot: ['^src/protocol/exchanges/', '^src/protocol/[^/]+\\.ts$', ledger] },
    },
    {
      name: 'wire-self-contained',
      severity: 'error',
      from: { path: '^src/wire/' },
      to: { pathNot: ['^src/wire/', '^[a-z_]+$', '^[a-z_]+/[a-z]+$'] },
    },
    {
      name: 'transport-boundary',
      severity: 'error',
      from: { pathNot: ['^src/adapters/herdr/fleet\\.ts$', '^src/transport/'] },
      to: { path: '^src/transport/' },
    },
    {
      name: 'drizzle-adapter-only',
      severity: 'error',
      from: { pathNot: ['^src/adapters/db/', '^test/'] },
      to: { path: 'node_modules/drizzle-orm(/|$)' },
    },
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
      from: { orphan: true, pathNot: ['\\.d\\.ts$', '^src/(wire|view-model|pane|adapters/hooks|daemon/view|daemon/slots)/'] },
      to: {},
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    ...fragments,
  ],
};
