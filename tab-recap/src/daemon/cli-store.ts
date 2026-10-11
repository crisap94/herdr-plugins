import { stateStore } from '#src/adapters/db/database.ts';
import type { Store } from '#src/adapters/db/database.ts';
import type { NewerDatabase } from '#src/adapters/db/open.ts';
import { loadConfig, stateDir } from './config.ts';

export const openCliStore = (): Store | NewerDatabase => stateStore(stateDir(), { closedDays: loadConfig().closedLaneDays });
