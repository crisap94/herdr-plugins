import { HISTORY } from './001-history.ts';
import { LIVE } from './001-live.ts';
import { VIEWS } from './001-views.ts';
import type { Migration } from './migration.ts';

/** The first schema: live state, history and the derived views. */
export const m001: Migration = { version: 1, name: 'initial', up: [LIVE, HISTORY, VIEWS] };
