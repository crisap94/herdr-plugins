import { stripVTControlCharacters } from 'node:util';
import type { Line } from '../application/line.ts';

export const plain = (line: Line): string => stripVTControlCharacters(line);
