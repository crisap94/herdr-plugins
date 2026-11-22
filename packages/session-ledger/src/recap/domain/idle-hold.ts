export type IdleHold = 'on' | 'off';

export const parseIdleHold = (raw: unknown): IdleHold => (raw === 'off' ? 'off' : 'on');
