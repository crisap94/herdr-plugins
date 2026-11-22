import { join } from 'node:path';
import type { ConfigDirs } from '#src/ports/config-paths.ts';
import { fsPathOf } from '#src/recap/domain/fs-path.ts';

export const xdgPaths = (home: string): ConfigDirs => ({
    configDir: fsPathOf(join(home, '.config', 'herdr', 'plugins', 'config', 'tab-recap')),
    stateDir: fsPathOf(join(home, '.local', 'state', 'herdr', 'plugins', 'tab-recap')),
});
