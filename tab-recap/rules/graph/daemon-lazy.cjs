const memory = require('../../../ci/baselines/memory.json');

const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exact = (path) => `^${escaped(path.replace(/^tab-recap\//, ''))}$`;
const heavy = (specifier) => {
  const [scope, name, ...subpath] = specifier.split('/');
  return `node_modules/${escaped(`${scope}/${name}`)}/dist/src/${subpath.map(escaped).join('/')}${subpath.length > 0 ? '/' : ''}index\\.`;
};

module.exports = [
  {
    name: 'pane-daemon-lazy-heavy',
    severity: 'error',
    from: { path: memory.files.map((file) => exact(file.path)) },
    to: {
      path: memory.heavyModules.map(heavy),
      dependencyTypesNot: ['type-only', 'require', 'dynamic-import'],
    },
  },
];
