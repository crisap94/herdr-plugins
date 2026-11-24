import { parseExchangeVersion } from './primitives.ts';
import { must } from '@stateforge-labs/session-ledger';

export const KINDS_VERSION = must(parseExchangeVersion(2));
