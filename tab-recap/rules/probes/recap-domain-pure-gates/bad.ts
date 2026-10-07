import { readFileSync } from 'node:fs';

export const leak = readFileSync;
