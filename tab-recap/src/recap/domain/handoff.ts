import { parseExchangeName } from '#src/protocol/primitives.ts';
import { must } from '@stateforge-labs/session-ledger';

export const HANDOFF_EXCHANGE = must(parseExchangeName('handoff'));
