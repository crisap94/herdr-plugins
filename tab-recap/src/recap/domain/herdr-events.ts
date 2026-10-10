export type HerdrEvents = 'off' | 'on';

export const herdrEventsOf = (raw: string | undefined): HerdrEvents => (raw?.trim().toLowerCase() === 'on' ? 'on' : 'off');
