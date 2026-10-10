export type Origin = 'operator' | 'auto' | 'request';

export const originOf = (raw: string | null | undefined): Origin => (raw === 'auto' || raw === 'request' ? raw : 'operator');
