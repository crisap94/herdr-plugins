import { COMPACT_EVENTS } from '#src/protocol/exchanges/compact.ts';
import { HANDOFF_EVENTS } from '#src/protocol/exchanges/handoff.ts';
import { LIMITS } from '#src/protocol/primitives.ts';

export const EVENT_TOKEN = 'tab-recap-event';
export const EVENT_TTL_MS = 3_600_000;
export const VALUE_MAX = LIMITS.valueMax;

const LANE_EVENT_KINDS = [
    'recap-written', 'needs-raised', 'needs-cleared',
    'autocompact-decided', 'autocompact-skipped', 'lane-closed', 'daemon-started', 'daemon-stopping',
] as const;
const EXCHANGE_EVENT_KINDS = [...Object.values(COMPACT_EVENTS), ...Object.values(HANDOFF_EVENTS)] as const;

export const EVENT_KINDS = [...LANE_EVENT_KINDS, ...EXCHANGE_EVENT_KINDS] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export { eventValue, seqOf } from './legacy.ts';
