import { main } from '../../../../claude-code/src/main.ts';
import { start } from '../../../../claude-code/src/start-runner.ts';
import { database } from '../../../../tab-recap/src/adapters/db/database.ts';
import { daemon } from '../../../../tab-recap/src/daemon/x.ts';

export const probe = [main, start, database, daemon];
