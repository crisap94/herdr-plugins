import { createConnection } from 'node:net';
import { readFile } from 'node:fs/promises';
import type { Role } from '../wire/view/protocol.ts';
import { own } from './version.ts';

export const open = (role: Role, path: string): string => `${role} ${own()} ${String(createConnection(path).readyState)} ${typeof readFile}`;
