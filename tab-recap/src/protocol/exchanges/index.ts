import type { Exchange } from '../exchange.ts';
import { compact } from './compact.ts';
import { handoff } from './handoff.ts';

export const EXCHANGES = [compact, handoff] as const satisfies readonly Exchange[];
