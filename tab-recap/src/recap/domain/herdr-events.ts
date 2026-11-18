import type { Text } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';

export type HerdrEvents = 'off' | 'on';

export { herdrEventsOf } from './legacy.ts';

export const herdrEventsFrom = (raw: Text | undefined): HerdrEvents => (raw?.trim().toLowerCase() === 'on' ? 'on' : 'off');
