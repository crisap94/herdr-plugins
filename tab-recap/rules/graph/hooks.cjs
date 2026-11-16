module.exports = [
  {
    name: 'hooks-only-in-adapter',
    severity: 'error',
    from: { path: '^(src|bin)/', pathNot: ['^src/adapters/hooks/', '^src/experiment/read-paths\\.ts$'] },
    to: {
      path: 'node_modules/@stateforge-labs/harness-hooks(/|$)',
      dependencyTypesNot: ['type-only'],
    },
  },
];
