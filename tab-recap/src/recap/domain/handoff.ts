import { parseExchangeName } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';

export const HANDOFF_EXCHANGE = must(parseExchangeName('handoff'));
