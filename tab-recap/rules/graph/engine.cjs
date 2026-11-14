const engineFiles = require('../../ci/engine-files.json');

const exact = (path) => `^${path.replace(/[.]/g, '\\.')}$`;
const engine = Object.values(engineFiles).flat().map(exact);

module.exports = [
  {
    name: 'engine-self-contained',
    severity: 'error',
    from: { path: engine },
    to: { pathNot: [...engine, '^(node:)?util$'] },
  },
];
