import type { Count } from '@stateforge-labs/session-ledger';
import type { SessionId } from '#src/recap/domain/ids.ts';
import type { Text } from '@stateforge-labs/session-ledger';

export interface ClaudeLaunchEnv {
    readonly window: Count | null;
    readonly percent: Count | null;
}

export interface ClaudeLaunch {
    readonly env: ClaudeLaunchEnv;
    readonly settings: Text | null;
}

export interface ClaudeLaunches {
    launchOf(session: SessionId): ClaudeLaunch | null;
}
