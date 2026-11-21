import type { Count } from '#src/recap/domain/count.ts';
import type { SessionId } from '#src/recap/domain/ids.ts';
import type { Text } from '#src/recap/domain/text.ts';

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
