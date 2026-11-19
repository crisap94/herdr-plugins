import { capabilityValueTyped, type SettingCheck } from '#src/protocol/capability.ts';
import { EXCHANGES } from '#src/protocol/exchanges/index.ts';
import { handoff } from '#src/protocol/exchanges/handoff.ts';
import { KINDS_VERSION } from '#src/protocol/kinds.ts';
import type { TokenValue } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';

export const PROTOCOL_VERSION = '1';
export const capabilityValueOf = (isOn: SettingCheck): TokenValue => must(capabilityValueTyped(EXCHANGES, KINDS_VERSION, isOn));
export const CAPABILITY_VALUE: TokenValue = must(capabilityValueTyped(EXCHANGES.filter((exchange) => exchange.optIn !== handoff.optIn), KINDS_VERSION));
