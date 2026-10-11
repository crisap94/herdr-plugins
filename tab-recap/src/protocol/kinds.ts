import { exchangeVersion } from './primitives.ts';
import { must } from './result.ts';

export const KINDS_VERSION = must(exchangeVersion(1));
