import { stripVTControlCharacters } from 'node:util';
import type { Instant } from '../domain/time.ts';

export const stamp = (at: Instant): string => stripVTControlCharacters(String(at));
