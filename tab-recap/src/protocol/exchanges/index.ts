import type { Exchange } from '../exchange.ts';
import { compact } from './compact.ts';

export const EXCHANGES = [compact] as const satisfies readonly Exchange[];
