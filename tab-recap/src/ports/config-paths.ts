import type { FsPath } from '#src/recap/domain/fs-path.ts';

export interface ConfigDirs {
    readonly configDir: FsPath;
    readonly stateDir: FsPath;
}
