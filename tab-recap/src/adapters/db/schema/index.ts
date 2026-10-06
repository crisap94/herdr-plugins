import { m001 } from './001-initial.ts';
import type { Migration } from './migration.ts';

/** The only place a migration is registered, in order. */
export const MIGRATIONS: readonly Migration[] = [m001];
