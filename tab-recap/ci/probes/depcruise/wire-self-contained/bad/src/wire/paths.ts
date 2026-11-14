import { Database } from 'bun:sqlite';

export const open = (): Database => new Database(':memory:');
