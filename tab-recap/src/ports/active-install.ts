import type { FsPath } from '#src/recap/domain/fs-path.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Unknown } from './unknowable.ts';

export interface ActiveInstall {
    readonly kind: 'install';
    readonly root: FsPath;
    readonly version: Text;
    readonly launcher: FsPath;
}

export type ActiveInstallRead = ActiveInstall | Unknown;

export interface ActiveInstalls {
    active(): Promise<ActiveInstallRead>;
}
