import type { FsPath } from '#src/recap/domain/fs-path.ts';

export type { ConfigPaths } from './twins/legacy.ts';

export interface ConfigDirs {
    readonly configDir: FsPath;
    readonly stateDir: FsPath;
}
