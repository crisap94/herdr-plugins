import type { Config } from './types.ts';

export const LADDER: readonly Config[] = [
    { name: 'claude-haiku-medium', backend: 'claude', model: 'claude-haiku-5-5', effort: 'medium' },
    { name: 'claude-sonnet-medium', backend: 'claude', model: 'claude-sonnet-5-5', effort: 'medium' },
    { name: 'claude-sonnet-high', backend: 'claude', model: 'claude-sonnet-5-5', effort: 'high' },
    { name: 'codex-luna-low', backend: 'codex', model: 'gpt-6-luna', effort: 'low' },
    { name: 'codex-luna-medium', backend: 'codex', model: 'gpt-6-luna', effort: 'medium' },
    { name: 'codex-sol-medium', backend: 'codex', model: 'gpt-6.1-sol', effort: 'medium' },
    { name: 'codex-terra-medium', backend: 'codex', model: 'gpt-6.1-terra', effort: 'medium' },
];

export function ladder(shipped: Config, rungs: readonly Config[] = LADDER): Config[] {
    const marked = { ...shipped, shipped: true };
    const same = (config: Config): boolean => config.backend === shipped.backend && config.model === shipped.model && config.effort === shipped.effort;
    const rest = rungs.filter((config) => !same(config) && config.name !== shipped.name);
    return [marked, ...rest];
}
