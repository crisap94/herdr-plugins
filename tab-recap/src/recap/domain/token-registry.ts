import { CAPABILITY_TOKEN } from '#src/protocol/capability.ts';
import { EXCHANGES } from '#src/protocol/exchanges/index.ts';
import { answerToken } from '#src/protocol/exchange.ts';
import type { Exchange } from '#src/protocol/exchange.ts';
import { ownerTable } from '#src/protocol/owners.ts';
import type { OwnerTable } from '#src/protocol/owners.ts';
import { buildRegistry } from '#src/protocol/registry.ts';
import type { Registry } from '#src/protocol/registry.ts';
import { tokenName } from '#src/protocol/primitives.ts';
import type { TokenName } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import { API_TOKEN, NEEDS_TOKEN, RECAP_TOKEN, SHARE_TOKEN } from './lane-token-names.ts';
import { EVENT_TOKEN } from './event-token.ts';
import { LEASE } from './typing-lease.ts';

const named = (raw: string): TokenName => must(tokenName(raw));

const FIXED_OWN_NAMES: readonly TokenName[] = [API_TOKEN, SHARE_TOKEN, RECAP_TOKEN, NEEDS_TOKEN, EVENT_TOKEN, LEASE].map(named);

export const REGISTRY: Registry = must(buildRegistry(EXCHANGES, [...FIXED_OWN_NAMES, CAPABILITY_TOKEN]));

export const OWNERS: OwnerTable = ownerTable(REGISTRY);

export const answerNameOf = (exchange: Exchange): TokenName => must(answerToken(exchange));

export const ANSWER_TOKENS: readonly TokenName[] = EXCHANGES.map(answerNameOf);
