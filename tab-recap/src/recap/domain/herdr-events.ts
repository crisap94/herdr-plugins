import type { Text } from '@stateforge-labs/session-ledger';

export type HerdrEvents = 'off' | 'on';


export const herdrEventsFrom = (raw: Text | undefined): HerdrEvents => (raw?.trim().toLowerCase() === 'on' ? 'on' : 'off');
