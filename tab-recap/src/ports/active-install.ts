import type { FsPath } from '#src/recap/domain/fs-path.ts';
import type { Text } from '@stateforge-labs/session-ledger';
import type { Unknown } from '@stateforge-labs/session-ledger';

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
