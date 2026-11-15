module.exports = [
  {
    name: 'pane-closure',
    severity: 'error',
    from: { path: '^src/pane/' },
    to: { pathNot: ['^src/pane/', '^src/wire/', '^[a-z_]+$', '^[a-z_]+/[a-z]+$'] },
  },
];
