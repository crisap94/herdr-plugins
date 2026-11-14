const PACKAGES = ['session-ledger', 'session-ledger-sqlite', 'recap-view'];

const names = PACKAGES.join('|');

module.exports = PACKAGES.length === 0 ? [] : [
  {
    name: 'workspace-types-only',
    severity: 'error',
    from: { path: '^(src|bin)/' },
    to: {
      path: [`^@stateforge-labs/(${names})(/|$)`, `(^|/)packages/(${names})/`],
      dependencyTypesNot: ['type-only'],
    },
  },
];
