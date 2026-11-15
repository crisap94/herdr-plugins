import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { Role } from './view/protocol.ts';

export const pathOf = (role: Role): string => join('state', role);

export const read = (role: Role): Promise<string> => readFile(pathOf(role), 'utf8');
