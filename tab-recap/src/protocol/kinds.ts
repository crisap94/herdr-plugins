import { parseExchangeVersion } from './primitives.ts';
import { must } from '@stateforge-labs/session-ledger/unstable/protocol/result.ts';

export const KINDS_VERSION = must(parseExchangeVersion(2));
