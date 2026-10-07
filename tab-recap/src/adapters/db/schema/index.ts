import { m001 } from './001-initial.ts';
import { m002 } from './002-lane-web.ts';
import { m003 } from './003-rules.ts';
import { m004 } from './004-compaction.ts';
import { m005 } from './005-eval.ts';
import type { Migration } from './migration.ts';

/** The only place a migration is registered, in order. */
export const MIGRATIONS: readonly Migration[] = [m001, m002, m003, m004, m005];
