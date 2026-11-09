import { join } from 'node:path';
import type { ConfigPaths } from '#src/ports/config-paths.ts';

export const xdgPaths = (home: string): ConfigPaths => ({
    configDir: join(home, '.config', 'herdr', 'plugins', 'config', 'tab-recap'),
    stateDir: join(home, '.local', 'state', 'herdr', 'plugins', 'tab-recap'),
});
