import { m001 } from './001-initial.ts';
import { m002 } from './002-lane-web.ts';
import { m003 } from './003-rules.ts';
import { m004 } from './004-compaction.ts';
import { m005 } from './005-eval.ts';
import { m006 } from './006-ledger.ts';
import { m007 } from './007-curator.ts';
import { m008 } from './008-boundary-link.ts';
import { m009 } from './009-anchor.ts';
import { m010 } from './010-autocompact.ts';
import { m011 } from './011-autocompact-skip.ts';
import { m012 } from './012-herdr-events.ts';
import { m013 } from './013-herdr-asks.ts';
import { m014 } from './014-coverage-evidence.ts';
import type { Migration } from './migration.ts';

export const MIGRATIONS: readonly Migration[] = [m001, m002, m003, m004, m005, m006, m007, m008, m009, m010, m011, m012, m013, m014];
