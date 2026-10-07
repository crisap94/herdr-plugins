// The ConfigPaths for a platform: the one place that picks between the adapters.
import type { Platform } from '#src/ports/host.ts';
import type { ConfigPaths } from '#src/ports/config-paths.ts';
import { windowsPaths } from './config-paths-windows.ts';
import { xdgPaths } from './config-paths-xdg.ts';

export const configPathsFor = (platform: Platform, home: string, env: Readonly<Record<string, string | undefined>>): ConfigPaths =>
    (platform === 'windows' ? windowsPaths(home, env) : xdgPaths(home));
