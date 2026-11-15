import { join } from 'node:path';
import { stateDir } from '#src/daemon/config.ts';

const given = process.env['TAB_RECAP_STATE'];
export const DESKTOP_STATE: string = given !== undefined && given !== '' ? given : join(stateDir(), 'desktop');
process.env['TAB_RECAP_STATE'] = DESKTOP_STATE;
