import type { Text } from '@stateforge-labs/session-ledger';

export type TelemetryTags = 'on' | 'off';

export const telemetryTagsOf = (raw: Text | undefined): TelemetryTags => (raw?.trim().toLowerCase() === 'on' ? 'on' : 'off');
