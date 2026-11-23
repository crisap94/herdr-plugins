import type { Runtime } from '@stateforge-labs/harness-adapters/runtime';

export const probe = (): Runtime => {
  const loaded: Runtime = require('@stateforge-labs/harness-adapters/runtime');
  return loaded;
};
