import type { Text } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';

export type TelemetryTags = 'on' | 'off';

export const telemetryTagsOf = (raw: Text | undefined): TelemetryTags => (raw?.trim().toLowerCase() === 'on' ? 'on' : 'off');
