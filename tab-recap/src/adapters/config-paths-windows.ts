import { join } from 'node:path';
import type { ConfigPaths } from '#src/ports/config-paths.ts';

export function windowsPaths(home: string, env: Readonly<Record<string, string | undefined>>): ConfigPaths {
    const roaming = env['APPDATA'] ?? join(home, 'AppData', 'Roaming');
    const local = env['LOCALAPPDATA'] ?? join(home, 'AppData', 'Local');
    return {
        configDir: join(roaming, 'herdr', 'plugins', 'config', 'tab-recap'),
        stateDir: join(local, 'herdr', 'plugins', 'state', 'tab-recap'),
    };
}
