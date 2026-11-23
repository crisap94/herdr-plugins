import type { EnvironmentName } from '@stateforge-labs/session-ledger/unstable/recap/domain/backend.ts';
import type { Text } from '#src/recap/domain/text.ts';

export * from '@stateforge-labs/session-ledger/unstable/recap/domain/backend.ts';

export type EnvironmentReader = (key: EnvironmentName) => Text | undefined;
