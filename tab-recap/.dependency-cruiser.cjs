const brandImporters = require('./ci/brand-importers.json');

const exact = (path) => `^${path.replace(/[.]/g, '\\.')}$`;
const brandFile = exact('src/recap/domain/brand.ts');

module.exports = {
  options: {
    tsPreCompilationDeps: true,
  },
  forbidden: [
    {
      name: 'domain-pure',
      severity: 'error',
      from: { path: '^src/recap/domain/(?!gates/)' },
      to: { pathNot: ['^src/recap/domain/', '^src/protocol/'] },
    },
    {
      name: 'domain-gates-pure',
      severity: 'error',
      from: { path: '^src/recap/domain/gates/' },
      to: { pathNot: ['^src/recap/domain/gates/', '^src/recap/domain/[^/]+\\.ts$'] },
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
      to: { pathNot: '^src/protocol/' },
    },
    {
      name: 'protocol-exchanges-self-contained',
      severity: 'error',
      from: { path: '^src/protocol/exchanges/' },
      to: { pathNot: ['^src/protocol/exchanges/', '^src/protocol/[^/]+\\.ts$'] },
    },
    {
      name: 'transport-boundary',
      severity: 'error',
      from: { pathNot: ['^src/adapters/herdr-fleet\\.ts$', '^src/transport/'] },
      to: { path: '^src/transport/' },
    },
    {
      name: 'brand-importers',
      severity: 'error',
      from: { pathNot: [...brandImporters.map(exact), brandFile] },
      to: { path: brandFile },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'error',
      from: { orphan: true },
      to: {},
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
};
