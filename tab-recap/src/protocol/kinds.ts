import { parseExchangeVersion } from './primitives.ts';
import { must } from './result.ts';

export const KINDS_VERSION = must(parseExchangeVersion(2));
