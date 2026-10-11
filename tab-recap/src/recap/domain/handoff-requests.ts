import type { HerdrEvents } from '#src/recap/domain/herdr-events.ts';

export type HandoffRequests = 'off' | 'on';

export const handoffRequestsOf = (raw: unknown, sharing: HerdrEvents): HandoffRequests => (raw === 'on' && sharing === 'on' ? 'on' : 'off');
